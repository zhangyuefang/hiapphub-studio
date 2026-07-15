use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::Path;
use std::fs;
use serde::{Serialize, Deserialize};

const HAP_MAGIC: u32 = 0x48415001; // "HAP\x01" LE
const FORMAT_VERSION: u16 = 1;
const FLAG_ENCRYPTED: u16 = 0x0001;
#[allow(dead_code)]
const FLAG_SIGNED: u16 = 0x0002;
const HEADER_SIZE: u64 = 64;

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
            return Err(io::Error::new(io::ErrorKind::InvalidData, "不是有效的 HAP 文件"));
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
        self.reader.seek(SeekFrom::Start(
            self.header.data_offset as u64 + entry.offset,
        ))?;
        let mut compressed = vec![0u8; entry.compressed_size as usize];
        self.reader.read_exact(&mut compressed)?;

        if entry.encrypted {
            return Err(io::Error::new(
                io::ErrorKind::Unsupported,
                "加密文件需要解密凭证（暂未实现）",
            ));
        }

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
                format!("CRC-32 校验失败: 期望 {:#010X}, 实际 {:#010X}", entry.crc32, actual_crc),
            ));
        }

        Ok(data)
    }

    pub fn read_file(&mut self, path: &str) -> io::Result<Vec<u8>> {
        let entry = self.find_entry(path)
            .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, format!("文件未找到: {path}")))?
            .clone();
        self.read_entry(&entry)
    }

    #[allow(dead_code)]
    pub fn is_encrypted(&self) -> bool {
        self.header.flags & FLAG_ENCRYPTED != 0
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
}

#[allow(dead_code)]
impl HapBuilder {
    pub fn new() -> Self {
        Self {
            entries: Vec::new(),
            encrypted: false,
        }
    }

    #[allow(dead_code)]
    pub fn set_encrypted(&mut self, encrypted: bool) {
        self.encrypted = encrypted;
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

            let entry = HapEntry {
                path: be.path.clone(),
                offset: data_offset_cursor,
                compressed_size: compressed.len() as u64,
                original_size: be.data.len() as u64,
                compression,
                encrypted: be.encrypted,
                crc32: crc,
            };
            data_offset_cursor += compressed.len() as u64;
            compressed_entries.push((entry, compressed));
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
        for (_, compressed) in &compressed_entries {
            data_buf.extend_from_slice(compressed);
        }

        let sha256 = compute_sha256_bytes(&data_buf);

        let mut header = [0u8; 64];
        header[0..4].copy_from_slice(&HAP_MAGIC.to_le_bytes());
        header[4..6].copy_from_slice(&FORMAT_VERSION.to_le_bytes());
        let flags: u16 = if self.encrypted { FLAG_ENCRYPTED } else { 0 };
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

        Ok(())
    }

    pub fn build_to_file(&self, path: &Path) -> io::Result<()> {
        let file = fs::File::create(path)?;
        let mut writer = io::BufWriter::new(file);
        self.build(&mut writer)
    }
}

#[allow(dead_code)]
fn compute_sha256_bytes(data: &[u8]) -> [u8; 32] {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut result = [0u8; 32];
    let mut hasher = DefaultHasher::new();
    data.hash(&mut hasher);
    let h = hasher.finish();
    result[0..8].copy_from_slice(&h.to_le_bytes());
    result[8..16].copy_from_slice(&h.to_le_bytes());
    result[16..24].copy_from_slice(&h.to_le_bytes());
    result[24..32].copy_from_slice(&h.to_le_bytes());
    result
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
pub fn read_file_from_hap_or_zip(hap_path: &Path, file_path: &str) -> io::Result<Vec<u8>> {
    if is_hap_format(hap_path)? {
        let mut reader = HapReader::open_file(hap_path)?;
        reader.read_file(file_path)
    } else {
        let file = fs::File::open(hap_path)?;
        let mut archive = zip::ZipArchive::new(file)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        let mut entry = archive.by_name(file_path)
            .map_err(|e| io::Error::new(io::ErrorKind::NotFound, e))?;
        let mut buf = Vec::new();
        entry.read_to_end(&mut buf)?;
        Ok(buf)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
