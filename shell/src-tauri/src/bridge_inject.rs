/// Shell 主窗口 Bridge：注入到 Shell 自身 WebView，使 Shell 前端也可用 window.hap.*
pub fn generate_shell_bridge_script() -> String {
    let app_id = "hiapphub-shell";
    let app_version = env!("CARGO_PKG_VERSION");
    format!(
        r#"(function() {{
  var APP_ID = {app_id_json};
  var APP_VERSION = {app_version_json};
  var invoke = window.__TAURI_INTERNALS__
    ? window.__TAURI_INTERNALS__.invoke
    : function() {{ return Promise.reject(new Error('Tauri IPC not available')); }};

  function callHal(moduleName, symbolName, params) {{
    return invoke('hap_call_function', {{
      moduleName: moduleName,
      symbolName: symbolName,
      paramsJson: JSON.stringify(params || {{}})
    }}).then(function(r) {{
      try {{ return JSON.parse(r); }} catch(_) {{ return r; }}
    }});
  }}

  window.hap = {{
    app: {{
      id: APP_ID,
      version: APP_VERSION,
      get dataDir() {{
        return invoke('get_data_dir').then(function(d) {{ return d + '/data/plugins/' + APP_ID; }});
      }}
    }},
    db: {{
      get: function(key) {{ return invoke('db_plugin_get', {{ pluginId: APP_ID, key: key }}); }},
      set: function(key, value) {{ return invoke('db_plugin_set', {{ pluginId: APP_ID, key: key, value: String(value) }}); }},
      delete: function(key) {{ return invoke('db_plugin_delete', {{ pluginId: APP_ID, key: key }}); }}
    }},
    system: {{
      listHalModules: function() {{ return invoke('hap_list_modules'); }},
      callHalFunction: function(mod, fn, p) {{ return callHal(mod, 'hap_' + mod + '_' + fn, p); }},
      reloadModules: function() {{ return invoke('hap_reload_modules'); }},
      listPlugins: function() {{ return invoke('hap_list_plugins'); }},
      openApp: function(appId, params) {{
        var pj = null;
        if (params && typeof params === 'object') pj = JSON.stringify(params);
        return invoke('hap_open_app', {{ pluginId: appId, pluginName: (typeof params === 'string' ? params : appId), paramsJson: pj }});
      }},
      installPlugin: function(url) {{ return invoke('hap_install_plugin', {{ hapPath: url }}); }},
      revealInFolder: function(path) {{ return invoke('hap_reveal_in_folder', {{ path: path }}); }},
      setLocale: function(locale) {{ return invoke('set_locale', {{ locale: locale }}); }},
      loadPluginHtml: function(pluginId, file) {{ return invoke('hap_load_plugin_html', {{ pluginId: pluginId, file: file || 'index.html' }}); }},
      libUsageStats: function() {{ return invoke('hap_lib_usage_stats'); }},
      storeAuth: function(data) {{ return invoke('store_auth_data', {{ data: data }}); }},
      loadAuth: function() {{ return invoke('load_auth_data'); }},
      clearAuth: function() {{ return invoke('clear_auth_data'); }},
      getVersions: function() {{ return invoke('hap_get_versions'); }},
      replaceHap: function(appId, hapPath) {{ return invoke('hap_replace', {{ appId: appId, hapPath: hapPath }}); }},
      rollbackHap: function(appId) {{ return invoke('hap_rollback', {{ appId: appId }}); }},
      checkForUpdates: function() {{ return invoke('hap_check_updates'); }},
      downloadUpdate: function(url, appId) {{ return invoke('hap_download_update', {{ url: url, appId: appId }}); }}
    }},
    window: {{
      close: function() {{ return invoke('plugin:window|close', {{ label: 'main' }}); }},
      minimize: function() {{ return invoke('plugin:window|minimize', {{ label: 'main' }}); }},
      maximize: function() {{ return invoke('plugin:window|maximize', {{ label: 'main' }}); }},
      unmaximize: function() {{ return invoke('plugin:window|unmaximize', {{ label: 'main' }}); }},
      isMaximized: function() {{ return invoke('plugin:window|is_maximized', {{ label: 'main' }}); }},
      isFullscreen: function() {{ return invoke('plugin:window|is_fullscreen', {{ label: 'main' }}); }},
      setFullscreen: function(v) {{ return invoke('plugin:window|set_fullscreen', {{ label: 'main', value: v }}); }},
      setDecorations: function(v) {{ return invoke('plugin:window|set_decorations', {{ label: 'main', value: v }}); }},
      focus: function() {{ return invoke('plugin:window|set_focus', {{ label: 'main' }}); }},
      setSize: function(w, h) {{ return invoke('plugin:window|set_size', {{ label: 'main', value: {{ type: 'Logical', data: {{ width: w, height: h }} }} }}); }},
      setPosition: function(x, y) {{ return invoke('plugin:window|set_position', {{ label: 'main', value: {{ type: 'Logical', data: {{ x: x, y: y }} }} }}); }},
      getBounds: function() {{
        return Promise.all([
          invoke('plugin:window|outer_position', {{ label: 'main' }}),
          invoke('plugin:window|outer_size', {{ label: 'main' }})
        ]).then(function(r) {{ return {{ x: r[0].x, y: r[0].y, width: r[1].width, height: r[1].height }}; }});
      }},
      onResized: function(handler) {{
        if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.listen) {{
          return window.__TAURI_INTERNALS__.listen('tauri://resize', handler);
        }}
        return Promise.resolve(function() {{}});
      }}
    }},
    fs: {{
      readTextFile: function(path) {{ return callHal('fs', 'hap_fs_read_text_file', {{ path: path }}); }},
      writeTextFile: function(path, content) {{ return callHal('fs', 'hap_fs_write_text_file', {{ path: path, content: content }}); }},
      exists: function(path) {{ return callHal('fs', 'hap_fs_exists', {{ path: path }}).then(function(r) {{ return !!r; }}); }},
      readDir: function(path) {{ return callHal('fs', 'hap_fs_read_dir', {{ path: path }}); }},
      createDir: function(path) {{ return callHal('fs', 'hap_fs_create_dir', {{ path: path }}); }},
      remove: function(path) {{ return callHal('fs', 'hap_fs_remove', {{ path: path }}); }}
    }},
    event: {{
      _unlisten: {{}},
      _seq: 0,
      on: function(event, handler) {{
        var fullEvent = event.startsWith('window:') ? 'tauri://' + event.substring(7) : 'hap:' + APP_ID + ':' + event;
        var key = fullEvent + ':' + (++window.hap.event._seq);
        if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.listen) {{
          window.__TAURI_INTERNALS__.listen(fullEvent, function(e) {{ handler(e.payload); }}).then(function(u) {{
            window.hap.event._unlisten[key] = u;
          }});
        }}
        handler._hapKey = key;
      }},
      off: function(_event, handler) {{
        if (handler && handler._hapKey && window.hap.event._unlisten[handler._hapKey]) {{
          window.hap.event._unlisten[handler._hapKey]();
          delete window.hap.event._unlisten[handler._hapKey];
        }}
      }},
      emit: function(event, payload) {{
        return invoke('plugin:event|emit', {{ event: 'hap:' + APP_ID + ':' + event, payload: payload }});
      }}
    }},
    hal: function(moduleName, functionName, params) {{
      return callHal(moduleName, 'hap_' + moduleName + '_' + functionName, params);
    }}
  }};
  Object.freeze(window.hap.app);
  Object.freeze(window.hap.db);
  Object.freeze(window.hap.system);
  Object.freeze(window.hap.fs);
}})();
"#,
        app_id_json = serde_json::to_string(app_id).unwrap_or_else(|_| format!("\"{}\"", app_id)),
        app_version_json = serde_json::to_string(app_version).unwrap_or_else(|_| "\"0.1.0\"".to_string())
    )
}

/// 生成注入到 HAP 应用 WebView 的 `window.hap` Bridge 脚本（子进程插件窗口用）。
pub fn generate_bridge_script(app_id: &str) -> String {
    let app_version = crate::hap_manager::get_plugin_version(app_id).unwrap_or_default();
    format!(
        r#"(function() {{
  const APP_ID = {app_id_json};
  const APP_VERSION = {app_version_json};
  const invoke = window.__TAURI_INTERNALS__
    ? window.__TAURI_INTERNALS__.invoke
    : function() {{ return Promise.reject(new Error('Tauri IPC not available')); }};

  function callHal(moduleName, symbolName, params) {{
    return invoke('hap_call_function', {{
      moduleName: moduleName,
      symbolName: symbolName,
      paramsJson: JSON.stringify(params || {{}})
    }}).then(function(r) {{
      try {{ return JSON.parse(r); }} catch(_) {{ return r; }}
    }});
  }}

  window.hap = {{
    app: {{
      id: APP_ID,
      version: APP_VERSION,
      get dataDir() {{
        return invoke('get_data_dir').then(function(d) {{ return d + '/data/plugins/' + APP_ID; }});
      }}
    }},

    db: {{
      get: function(key) {{
        return invoke('db_plugin_get', {{ pluginId: APP_ID, key: key }});
      }},
      set: function(key, value) {{
        return invoke('db_plugin_set', {{ pluginId: APP_ID, key: key, value: String(value) }});
      }}
    }},

    system: {{
      listHalModules: function() {{
        return invoke('hap_list_modules');
      }},
      callHalFunction: function(moduleName, functionName, params) {{
        return callHal(moduleName, 'hap_' + moduleName + '_' + functionName, params);
      }},
      reloadHalModules: function() {{
        return invoke('hap_reload_modules');
      }},
      shellInfo: function() {{
        return invoke('hap_list_plugins').then(function() {{
          return {{ version: '1.0.0' }};
        }});
      }},
      openApp: function(appId, params) {{
        var paramsJson = null;
        if (params && typeof params === 'object') {{
          paramsJson = JSON.stringify(params);
        }}
        return invoke('hap_open_app', {{ pluginId: appId, pluginName: (typeof params === 'string' ? params : appId), paramsJson: paramsJson }});
      }},
      openPluginWindow: function(appId, appName) {{
        return invoke('hap_open_plugin_window', {{ pluginId: appId, pluginName: appName || appId }});
      }}
    }},

    window: {{
      _label: 'plugin-' + APP_ID,
      setSize: function(width, height) {{
        return invoke('plugin:window|set_size', {{ label: this._label, value: {{ type: 'Logical', data: {{ width: width, height: height }} }} }});
      }},
      setTitle: function(title) {{
        return invoke('plugin:window|set_title', {{ label: this._label, value: title }});
      }},
      center: function() {{
        return invoke('plugin:window|center', {{ label: this._label }});
      }},
      close: function() {{
        return invoke('plugin:window|close', {{ label: this._label }});
      }},
      minimize: function() {{
        return invoke('plugin:window|minimize', {{ label: this._label }});
      }},
      maximize: function() {{
        return invoke('plugin:window|maximize', {{ label: this._label }});
      }},
      isMaximized: function() {{
        return invoke('plugin:window|is_maximized', {{ label: this._label }});
      }},
      isFullscreen: function() {{
        return invoke('plugin:window|is_fullscreen', {{ label: this._label }});
      }},
      setFullscreen: function(fullscreen) {{
        return invoke('plugin:window|set_fullscreen', {{ label: this._label, value: fullscreen }});
      }},
      onResized: function(handler) {{
        if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.listen) {{
          return window.__TAURI_INTERNALS__.listen('tauri://resize', handler);
        }}
        return Promise.resolve(function() {{}});
      }},
      createSubWindow: function(subId, title, url, opts) {{
        return invoke('hap_create_sub_window', {{
          pluginId: APP_ID,
          subId: subId,
          title: title,
          url: url,
          width: opts && opts.width,
          height: opts && opts.height,
          appIdOverride: opts && opts.appId
        }});
      }},
      create: function(opts) {{
        var o = opts || {{}};
        return invoke('hap_create_child_window', {{
          pluginId: APP_ID,
          label: o.label || 'child',
          route: o.route,
          title: o.title,
          width: o.width,
          height: o.height,
          decorations: o.decorations,
          resizable: o.resizable,
          transparent: o.transparent,
          hiddenTitle: o.hiddenTitle,
          titleBarStyle: o.titleBarStyle,
          anchorRight: o.anchorRight
        }});
      }},
      closeSubWindow: function(subId) {{
        return invoke('hap_close_sub_window', {{ pluginId: APP_ID, subId: subId }});
      }},
      postMessage: function(label, data) {{
        return invoke('plugin:event|emit', {{ event: 'hap:msg:' + label, payload: data }});
      }},
      onMessage: function(handler) {{
        var evName = 'hap:msg:plugin-' + APP_ID;
        if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.listen) {{
          window.__TAURI_INTERNALS__.listen(evName, function(e) {{ handler(e.payload); }});
        }}
        return evName;
      }},
      onResize: function(handler) {{
        if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.listen) {{
          window.__TAURI_INTERNALS__.listen('tauri://resize', function(e) {{
            handler({{ width: e.payload.width, height: e.payload.height }});
          }});
        }}
        return 'tauri://resize';
      }}
    }},

    dialog: {{
      openFile: function(opts) {{
        return invoke('plugin:dialog|open', {{
          title: opts && opts.title,
          filters: opts && opts.filters,
          multiple: opts && opts.multiple,
          directory: false
        }});
      }},
      openDirectory: function(opts) {{
        return invoke('plugin:dialog|open', {{
          title: opts && opts.title,
          multiple: false,
          directory: true
        }});
      }},
      saveFile: function(opts) {{
        return invoke('plugin:dialog|save', {{
          title: opts && opts.title,
          filters: opts && opts.filters,
          defaultPath: opts && opts.defaultPath
        }});
      }},
      messageBox: function(title, message, opts) {{
        return invoke('plugin:dialog|message', {{
          title: title,
          message: message,
          kind: opts && opts.type
        }});
      }},
      confirm: function(title, message) {{
        return invoke('plugin:dialog|confirm', {{
          title: title,
          message: message
        }});
      }}
    }},

    notification: {{
      show: function(title, body) {{
        return invoke('plugin:notification|notify', {{
          title: title,
          body: body
        }});
      }}
    }},

    fs: {{
      readTextFile: function() {{ return Promise.reject(new Error('fs not available in Shell; use independent app host')); }},
      writeTextFile: function() {{ return Promise.reject(new Error('fs not available in Shell; use independent app host')); }},
      exists: function() {{ return Promise.reject(new Error('fs not available in Shell; use independent app host')); }}
    }},

    event: {{
      _unlisten: {{}},
      emit: function(event, payload) {{
        return invoke('plugin:event|emit', {{ event: 'hap:' + APP_ID + ':' + event, payload: payload }});
      }},
      on: function(event, handler) {{
        var fullEvent = 'hap:' + APP_ID + ':' + event;
        var key = fullEvent + ':' + (++window.hap.event._seq);
        if (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.listen) {{
          window.__TAURI_INTERNALS__.listen(fullEvent, function(e) {{ handler(e.payload); }}).then(function(unlisten) {{
            window.hap.event._unlisten[key] = unlisten;
          }});
        }}
        handler._hapKey = key;
      }},
      off: function(_event, handler) {{
        if (handler && handler._hapKey && window.hap.event._unlisten[handler._hapKey]) {{
          window.hap.event._unlisten[handler._hapKey]();
          delete window.hap.event._unlisten[handler._hapKey];
        }}
      }},
      _seq: 0
    }},

    /** 通用 HAL 模块调用：window.hap.hal(moduleName, functionName, params) */
    hal: function(moduleName, functionName, params) {{
      return callHal(moduleName, 'hap_' + moduleName + '_' + functionName, params);
    }}
  }};

  Object.freeze(window.hap.app);
  Object.freeze(window.hap.db);
  Object.freeze(window.hap.system);
  Object.freeze(window.hap.window);
  Object.freeze(window.hap.dialog);
  Object.freeze(window.hap.notification);
  Object.freeze(window.hap.fs);
}})();
"#,
        app_id_json = serde_json::to_string(app_id).unwrap_or_else(|_| format!("\"{}\"", app_id)),
        app_version_json = serde_json::to_string(&app_version).unwrap_or_else(|_| "\"\"".to_string())
    )
}
