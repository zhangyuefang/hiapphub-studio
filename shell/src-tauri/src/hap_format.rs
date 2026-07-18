use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::Path;
use std::fs;
use serde::{Serialize, Deserialize};

const HAP_MAGIC: u32 = 0x48415001; // "HAP\x01" LE
const FORMAT_VERSION: u16 = 1;
const FLAG_ENCRYPTED: u16 = 0x0001;
const FLAG_SIGNED: u16 = 0x0002;
const HEADER_SIZE: u64 = 64;
const SIG_MAGIC: u32 = 0x53494731; // "SIG1" LE

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Compression {
    None = 0,
    Deflate = 1,
    Zstd = 2,
}

impl Compression {
    fn from_u8(v: u8) -> Self {
        match v {
            1 => Self::Deflate,
            2 => Self::Zstd,
            _ => Self::None,
        }
    }
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct HapEntry {
    pub path: String,
    pub offset: u64,
    pub compressed_size: u64,
    pub original_size: u64,
    pub compression: Compression,
    pub encrypted: bool,
    pub crc32: u32,
}

#[derive(Debug)]
#[allow(dead_code)]
pub struct HapHeader {
    pub format_version: u16,
    pub flags: u16,
    pub entry_count: u32,
    pub dir_offset: u32,
    pub dir_size: u32,
    pub data_offset: u32,
    pub data_size: u64,
    pub sha256: [u8; 32],
}

#[allow(dead_code)]
pub struct HapReader<R: Read + Seek> {
    reader: R,
    pub header: HapHeader,
    pub entries: Vec<HapEntry>,
}

impl<R: Read + Seek> HapReader<R> {
    pub fn open(mut reader: R) -> io::Result<Self> {
        let header = Self::read_header(&mut reader)?;
        let entries = Self::read_directory(&mut reader, &header)?;
        Ok(Self { reader, header, entries })
    }

    fn read_header(r: &mut R) -> io::Result<HapHeader> {
        let mut buf = [0u8; 64];
        r.seek(SeekFrom::Start(0))?;
        r.read_exact(&mut buf)?;

        let magic = u32::from_le_bytes([buf[0], buf[1], buf[2], buf[3]]);
        if magic != HAP_MAGIC {
            return Err(io::Error::new(io::ErrorKind::InvalidData, "not a valid HAP file"));
        }

        let format_version = u16::from_le_bytes([buf[4], buf[5]]);
        let flags = u16::from_le_bytes([buf[6], buf[7]]);
        let entry_count = u32::from_le_bytes([buf[8], buf[9], buf[10], buf[11]]);
        let dir_offset = u32::from_le_bytes([buf[12], buf[13], buf[14], buf[15]]);
        let dir_size = u32::from_le_bytes([buf[16], buf[17], buf[18], buf[19]]);
        let data_offset = u32::from_le_bytes([buf[20], buf[21], buf[22], buf[23]]);
        let data_size = u64::from_le_bytes([
            buf[24], buf[25], buf[26], buf[27],
            buf[28], buf[29], buf[30], buf[31],
        ]);
        let mut sha256 = [0u8; 32];
        sha256.copy_from_slice(&buf[32..64]);

        Ok(HapHeader {
            format_version, flags, entry_count,
            dir_offset, dir_size, data_offset,
            data_size, sha256,
        })
    }

    fn read_directory(r: &mut R, header: &HapHeader) -> io::Result<Vec<HapEntry>> {
        r.seek(SeekFrom::Start(header.dir_offset as u64))?;
        let mut entries = Vec::with_capacity(header.entry_count as usize);

        for _ in 0..header.entry_count {
            let mut len_buf = [0u8; 2];
            r.read_exact(&mut len_buf)?;
            let path_len = u16::from_le_bytes(len_buf) as usize;

            let mut path_buf = vec![0u8; path_len];
            r.read_exact(&mut path_buf)?;
            let path = String::from_utf8(path_buf)
                .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;

            let mut meta = [0u8; 30];
            r.read_exact(&mut meta)?;

            let offset = u64::from_le_bytes(meta[0..8].try_into().unwrap());
            let compressed_size = u64::from_le_bytes(meta[8..16].try_into().unwrap());
            let original_size = u64::from_le_bytes(meta[16..24].try_into().unwrap());
            let compression = Compression::from_u8(meta[24]);
            let encrypted = meta[25] != 0;
            let crc32 = u32::from_le_bytes(meta[26..30].try_into().unwrap());

            entries.push(HapEntry {
                path, offset, compressed_size, original_size,
                compression, encrypted, crc32,
            });
        }
        Ok(entries)
    }

    pub fn find_entry(&self, path: &str) -> Option<&HapEntry> {
        self.entries.iter().find(|e| e.path == path)
    }

    pub fn read_entry(&mut self, entry: &HapEntry) -> io::Result<Vec<u8>> {
        self.read_entry_with_key(entry, None)
    }

    pub fn read_entry_with_key(&mut self, entry: &HapEntry, decryption_key: Option<&[u8; 32]>) -> io::Result<Vec<u8>> {
        self.reader.seek(SeekFrom::Start(
            self.header.data_offset as u64 + entry.offset,
        ))?;
        let mut raw = vec![0u8; entry.compressed_size as usize];
        self.reader.read_exact(&mut raw)?;

        let compressed = if entry.encrypted {
            let key = decryption_key.ok_or_else(|| io::Error::new(
                io::ErrorKind::PermissionDenied,
                "encrypted file requires decryption key",
            ))?;
            decrypt_aes_gcm(key, &raw)?
        } else {
            raw
        };

        let data = match entry.compression {
            Compression::None => compressed,
            Compression::Deflate => {
                let mut decoder = flate2::read::DeflateDecoder::new(&compressed[..]);
                let mut out = Vec::with_capacity(entry.original_size as usize);
                decoder.read_to_end(&mut out)?;
                out
            }
            Compression::Zstd => {
                zstd::stream::decode_all(&compressed[..])?
            }
        };

        let actual_crc = crc32fast::hash(&data);
        if actual_crc != entry.crc32 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("CRC-32 check failed: expected {:#010X}, got {:#010X}", entry.crc32, actual_crc),
            ));
        }

        Ok(data)
    }

    pub fn verify_integrity(&mut self) -> io::Result<()> {
        let data_offset = self.header.data_offset as u64;
        let data_size = self.header.data_size;
        self.reader.seek(SeekFrom::Start(data_offset))?;
        let mut data_buf = vec![0u8; data_size as usize];
        self.reader.read_exact(&mut data_buf)?;
        let actual = compute_sha256_bytes(&data_buf);
        if actual != self.header.sha256 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "SHA-256 integrity check failed: data section has been modified",
            ));
        }
        Ok(())
    }

    pub fn read_file(&mut self, path: &str) -> io::Result<Vec<u8>> {
        let entry = self.find_entry(path)
            .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, format!("file not found: {path}")))?
            .clone();
        self.read_entry(&entry)
    }

    pub fn read_file_with_key(&mut self, path: &str, key: Option<&[u8; 32]>) -> io::Result<Vec<u8>> {
        let entry = self.find_entry(path)
            .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, format!("file not found: {path}")))?
            .clone();
        self.read_entry_with_key(&entry, key)
    }

    #[allow(dead_code)]
    pub fn is_encrypted(&self) -> bool {
        self.header.flags & FLAG_ENCRYPTED != 0
    }

    #[allow(dead_code)]
    pub fn is_signed(&self) -> bool {
        self.header.flags & FLAG_SIGNED != 0
    }

    #[allow(dead_code)]
    pub fn verify_signature(&mut self, public_key: &[u8; 32]) -> io::Result<bool> {
        if !self.is_signed() {
            return Ok(false);
        }
        let file_end = self.reader.seek(SeekFrom::End(0))?;
        if file_end < 68 {
            return Err(io::Error::new(io::ErrorKind::InvalidData, "file too small for signature"));
        }

        self.reader.seek(SeekFrom::End(-68))?;
        let mut sig_buf = [0u8; 68];
        self.reader.read_exact(&mut sig_buf)?;
        let sig_magic = u32::from_le_bytes([sig_buf[0], sig_buf[1], sig_buf[2], sig_buf[3]]);
        if sig_magic != SIG_MAGIC {
            return Err(io::Error::new(io::ErrorKind::InvalidData, "signature magic mismatch"));
        }

        let signed_len = file_end - 68;
        self.reader.seek(SeekFrom::Start(0))?;
        let mut signed_data = vec![0u8; signed_len as usize];
        self.reader.read_exact(&mut signed_data)?;

        use ed25519_dalek::{VerifyingKey, Signature, Verifier};
        let vk = VerifyingKey::from_bytes(public_key)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, format!("invalid public key: {e}")))?;
        let sig = Signature::from_bytes(&sig_buf[4..68].try_into()
            .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "invalid signature bytes"))?);
        Ok(vk.verify(&signed_data, &sig).is_ok())
    }
}

impl HapReader<io::BufReader<fs::File>> {
    pub fn open_file(path: &Path) -> io::Result<Self> {
        let file = fs::File::open(path)?;
        Self::open(io::BufReader::new(file))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct BuildEntry {
    path: String,
    data: Vec<u8>,
    encrypted: bool,
}

#[allow(dead_code)]
pub struct HapBuilder {
    entries: Vec<BuildEntry>,
    encrypted: bool,
    encryption_key: Option<[u8; 32]>,
    signing_key: Option<[u8; 64]>,
}

#[allow(dead_code)]
impl HapBuilder {
    pub fn new() -> Self {
        Self {
            entries: Vec::new(),
            encrypted: false,
            encryption_key: None,
            signing_key: None,
        }
    }

    #[allow(dead_code)]
    pub fn set_encrypted(&mut self, encrypted: bool, key: Option<[u8; 32]>) {
        self.encrypted = encrypted;
        self.encryption_key = key;
    }

    #[allow(dead_code)]
    pub fn set_signing_key(&mut self, key: [u8; 64]) {
        self.signing_key = Some(key);
    }

    pub fn add_file(&mut self, path: &str, data: Vec<u8>) {
        let no_encrypt = path == "manifest.json"
            || path == "icon.png"
            || path == "icon.svg";
        self.entries.push(BuildEntry {
            path: path.to_string(),
            data,
            encrypted: self.encrypted && !no_encrypt,
        });
    }

    pub fn add_dir(&mut self, base: &Path) -> io::Result<()> {
        self.add_dir_recursive(base, base)
    }

    fn add_dir_recursive(&mut self, base: &Path, current: &Path) -> io::Result<()> {
        for entry in fs::read_dir(current)? {
            let entry = entry?;
            let path = entry.path();
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if matches!(name, "node_modules" | "target" | ".git" | ".DS_Store") {
                    continue;
                }
                if name.ends_with(".hap") || name.ends_with(".tgz") {
                    continue;
                }
            }
            if path.is_dir() {
                self.add_dir_recursive(base, &path)?;
            } else {
                let relative = path.strip_prefix(base)
                    .map_err(|e| io::Error::new(io::ErrorKind::Other, e))?
                    .to_string_lossy()
                    .replace('\\', "/");
                let data = fs::read(&path)?;
                self.add_file(&relative, data);
            }
        }
        Ok(())
    }

    pub fn build<W: Write + Seek>(&self, mut w: W) -> io::Result<()> {
        let mut compressed_entries: Vec<(HapEntry, Vec<u8>)> = Vec::new();
        let mut data_offset_cursor: u64 = 0;

        for be in &self.entries {
            let crc = crc32fast::hash(&be.data);

            let (compressed, compression) = if be.data.len() > 64 {
                let mut enc = flate2::write::DeflateEncoder::new(
                    Vec::new(),
                    flate2::Compression::best(),
                );
                enc.write_all(&be.data)?;
                let result = enc.finish()?;
                if result.len() < be.data.len() {
                    (result, Compression::Deflate)
                } else {
                    (be.data.clone(), Compression::None)
                }
            } else {
                (be.data.clone(), Compression::None)
            };

            let final_data = if be.encrypted {
                let key = self.encryption_key.as_ref().ok_or_else(|| {
                    io::Error::new(io::ErrorKind::InvalidInput, "encryption key required for encrypted entries")
                })?;
                encrypt_aes_gcm(key, &compressed)?
            } else {
                compressed
            };

            let entry = HapEntry {
                path: be.path.clone(),
                offset: data_offset_cursor,
                compressed_size: final_data.len() as u64,
                original_size: be.data.len() as u64,
                compression,
                encrypted: be.encrypted,
                crc32: crc,
            };
            data_offset_cursor += final_data.len() as u64;
            compressed_entries.push((entry, final_data));
        }

        let dir_offset = HEADER_SIZE as u32;
        let mut dir_buf = Vec::new();
        for (entry, _) in &compressed_entries {
            let path_bytes = entry.path.as_bytes();
            dir_buf.extend_from_slice(&(path_bytes.len() as u16).to_le_bytes());
            dir_buf.extend_from_slice(path_bytes);
            dir_buf.extend_from_slice(&entry.offset.to_le_bytes());
            dir_buf.extend_from_slice(&entry.compressed_size.to_le_bytes());
            dir_buf.extend_from_slice(&entry.original_size.to_le_bytes());
            dir_buf.push(entry.compression as u8);
            dir_buf.push(if entry.encrypted { 1 } else { 0 });
            dir_buf.extend_from_slice(&entry.crc32.to_le_bytes());
        }

        let dir_size = dir_buf.len() as u32;
        let data_start = dir_offset + dir_size;

        let mut data_buf = Vec::new();
        for (_, final_data) in &compressed_entries {
            data_buf.extend_from_slice(final_data);
        }

        let sha256 = compute_sha256_bytes(&data_buf);

        let mut flags: u16 = 0;
        if self.encrypted { flags |= FLAG_ENCRYPTED; }
        if self.signing_key.is_some() { flags |= FLAG_SIGNED; }

        let mut header = [0u8; 64];
        header[0..4].copy_from_slice(&HAP_MAGIC.to_le_bytes());
        header[4..6].copy_from_slice(&FORMAT_VERSION.to_le_bytes());
        header[6..8].copy_from_slice(&flags.to_le_bytes());
        header[8..12].copy_from_slice(&(compressed_entries.len() as u32).to_le_bytes());
        header[12..16].copy_from_slice(&dir_offset.to_le_bytes());
        header[16..20].copy_from_slice(&dir_size.to_le_bytes());
        header[20..24].copy_from_slice(&data_start.to_le_bytes());
        header[24..32].copy_from_slice(&(data_buf.len() as u64).to_le_bytes());
        header[32..64].copy_from_slice(&sha256);

        w.seek(SeekFrom::Start(0))?;
        w.write_all(&header)?;
        w.write_all(&dir_buf)?;
        w.write_all(&data_buf)?;

        if let Some(ref sk_bytes) = self.signing_key {
            use ed25519_dalek::{SigningKey, Signer};
            let signing_key = SigningKey::from_keypair_bytes(sk_bytes)
                .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, format!("invalid signing key: {e}")))?;
            let mut signed_data = Vec::new();
            signed_data.extend_from_slice(&header);
            signed_data.extend_from_slice(&dir_buf);
            signed_data.extend_from_slice(&data_buf);
            let signature = signing_key.sign(&signed_data);
            w.write_all(&SIG_MAGIC.to_le_bytes())?;
            w.write_all(&signature.to_bytes())?;
        }

        Ok(())
    }

    pub fn build_to_file(&self, path: &Path) -> io::Result<()> {
        let file = fs::File::create(path)?;
        let mut writer = io::BufWriter::new(file);
        self.build(&mut writer)
    }
}

fn decrypt_aes_gcm(key: &[u8; 32], data: &[u8]) -> io::Result<Vec<u8>> {
    use aes_gcm::{Aes256Gcm, Key, Nonce};
    use aes_gcm::aead::{Aead, KeyInit};

    if data.len() < 28 {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "encrypted data too short (need nonce + tag)"));
    }
    let nonce_bytes = &data[..12];
    let tag_start = data.len() - 16;
    let ciphertext = &data[12..tag_start];
    let tag = &data[tag_start..];

    let cipher_key = Key::<Aes256Gcm>::from_slice(key);
    let cipher = Aes256Gcm::new(cipher_key);
    let nonce = Nonce::from_slice(nonce_bytes);

    let mut ct_with_tag = Vec::with_capacity(ciphertext.len() + 16);
    ct_with_tag.extend_from_slice(ciphertext);
    ct_with_tag.extend_from_slice(tag);

    cipher.decrypt(nonce, ct_with_tag.as_ref())
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "AES-256-GCM decryption failed"))
}

fn encrypt_aes_gcm(key: &[u8; 32], data: &[u8]) -> io::Result<Vec<u8>> {
    use aes_gcm::{Aes256Gcm, Key, Nonce};
    use aes_gcm::aead::{Aead, KeyInit};

    let cipher_key = Key::<Aes256Gcm>::from_slice(key);
    let cipher = Aes256Gcm::new(cipher_key);
    let mut nonce_bytes = [0u8; 12];
    getrandom::fill(&mut nonce_bytes)
        .map_err(|e| io::Error::new(io::ErrorKind::Other, format!("rng failed: {e}")))?;
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ct_with_tag = cipher.encrypt(nonce, data)
        .map_err(|_| io::Error::new(io::ErrorKind::Other, "AES-256-GCM encryption failed"))?;

    let tag_start = ct_with_tag.len() - 16;
    let ciphertext = &ct_with_tag[..tag_start];
    let tag = &ct_with_tag[tag_start..];

    let mut result = Vec::with_capacity(12 + ciphertext.len() + 16);
    result.extend_from_slice(&nonce_bytes);
    result.extend_from_slice(ciphertext);
    result.extend_from_slice(tag);
    Ok(result)
}

fn compute_sha256_bytes(data: &[u8]) -> [u8; 32] {
    use sha2::{Sha256, Digest};
    let mut hasher = Sha256::new();
    hasher.update(data);
    let result = hasher.finalize();
    let mut out = [0u8; 32];
    out.copy_from_slice(&result);
    out
}

/// Placeholder — integrity checking is done via HapReader method
pub fn verify_data_integrity<R: Read + Seek>(reader: &mut HapReader<R>) -> io::Result<()> {
    reader.verify_integrity()
}

#[allow(dead_code)]
pub fn is_hap_format(path: &Path) -> io::Result<bool> {
    let mut f = fs::File::open(path)?;
    let mut magic_buf = [0u8; 4];
    if f.read_exact(&mut magic_buf).is_err() {
        return Ok(false);
    }
    let magic = u32::from_le_bytes(magic_buf);
    Ok(magic == HAP_MAGIC)
}

#[allow(dead_code)]
pub fn read_file_from_hap(hap_path: &Path, file_path: &str) -> io::Result<Vec<u8>> {
    let mut reader = HapReader::open_file(hap_path)?;
    reader.read_file(file_path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn roundtrip_basic() {
        let mut builder = HapBuilder::new();
        builder.add_file("manifest.json", br#"{"id":"test"}"#.to_vec());
        builder.add_file("index.html", b"<h1>Hello</h1>".to_vec());
        builder.add_file("style.css", b"body { margin: 0; }".to_vec());

        let mut buf = Cursor::new(Vec::new());
        builder.build(&mut buf).unwrap();

        buf.seek(SeekFrom::Start(0)).unwrap();
        let mut reader = HapReader::open(buf).unwrap();

        assert_eq!(reader.entries.len(), 3);
        assert!(!reader.is_encrypted());

        let manifest = reader.read_file("manifest.json").unwrap();
        assert_eq!(manifest, br#"{"id":"test"}"#);

        let html = reader.read_file("index.html").unwrap();
        assert_eq!(html, b"<h1>Hello</h1>");

        let css = reader.read_file("style.css").unwrap();
        assert_eq!(css, b"body { margin: 0; }");
    }

    #[test]
    fn deflate_compression() {
        let mut builder = HapBuilder::new();
        let big_data = "a".repeat(1000);
        builder.add_file("big.txt", big_data.as_bytes().to_vec());

        let mut buf = Cursor::new(Vec::new());
        builder.build(&mut buf).unwrap();

        buf.seek(SeekFrom::Start(0)).unwrap();
        let mut reader = HapReader::open(buf).unwrap();
        let entry = reader.find_entry("big.txt").unwrap();
        assert_eq!(entry.compression, Compression::Deflate);
        assert!(entry.compressed_size < entry.original_size);

        let data = reader.read_file("big.txt").unwrap();
        assert_eq!(data.len(), 1000);
    }

    #[test]
    fn encrypted_roundtrip() {
        let key: [u8; 32] = [0x42u8; 32];
        let mut builder = HapBuilder::new();
        builder.set_encrypted(true, Some(key));
        builder.add_file("manifest.json", br#"{"id":"enc"}"#.to_vec());
        builder.add_file("index.html", b"<h1>Secret</h1>".to_vec());
        builder.add_file("secret.js", b"var x = 42;".to_vec());

        let mut buf = Cursor::new(Vec::new());
        builder.build(&mut buf).unwrap();

        buf.seek(SeekFrom::Start(0)).unwrap();
        let mut reader = HapReader::open(buf).unwrap();
        assert!(reader.is_encrypted());

        let manifest = reader.read_file("manifest.json").unwrap();
        assert_eq!(manifest, br#"{"id":"enc"}"#);

        let html = reader.read_file_with_key("index.html", Some(&key)).unwrap();
        assert_eq!(html, b"<h1>Secret</h1>");

        let js = reader.read_file_with_key("secret.js", Some(&key)).unwrap();
        assert_eq!(js, b"var x = 42;");

        assert!(reader.read_file("index.html").is_err());
    }

    #[test]
    fn signed_roundtrip() {
        use ed25519_dalek::SigningKey;
        let sk = SigningKey::generate(&mut rand_core::OsRng);
        let pk_bytes = sk.verifying_key().to_bytes();
        let kp_bytes = sk.to_keypair_bytes();

        let mut builder = HapBuilder::new();
        builder.set_signing_key(kp_bytes);
        builder.add_file("manifest.json", br#"{"id":"sig"}"#.to_vec());

        let mut buf = Cursor::new(Vec::new());
        builder.build(&mut buf).unwrap();

        buf.seek(SeekFrom::Start(0)).unwrap();
        let mut reader = HapReader::open(buf).unwrap();
        assert!(reader.is_signed());
        assert!(reader.verify_signature(&pk_bytes).unwrap());

        let manifest = reader.read_file("manifest.json").unwrap();
        assert_eq!(manifest, br#"{"id":"sig"}"#);
    }

    #[test]
    fn test_read_devtools_hap() {
        let path = std::path::Path::new("/Users/mac/.hiapphub/app/hiapphub-devtools.hap");
        if !path.exists() { return; }
        let mut reader = HapReader::open_file(path).expect("should open devtools hap");
        let data = reader.read_file("manifest.json").expect("should read manifest");
        let content = String::from_utf8(data).expect("should be utf8");
        let v: serde_json::Value = serde_json::from_str(&content).expect("should parse json");
        eprintln!("DevTools manifest: id={}, name={}", v["id"], v["name"]);
        assert_eq!(v["id"].as_str().unwrap(), "hiapphub-devtools");
    }
}
