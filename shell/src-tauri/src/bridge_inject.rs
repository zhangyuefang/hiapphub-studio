/// 生成注入到 HAP 应用 WebView 的 `window.hap` Bridge 脚本。
/// 所有 HAL 支持库函数通过 `hap_call_function` Tauri 命令统一调用。
/// clipboard/crypto/http/tray/i18n 等由 HAL 模块提供，通过 window.hap.hal() 调用。
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
      readTextFile: function(path) {{
        return invoke('fs_read_text_file', {{ path: path }});
      }},
      writeTextFile: function(path, content) {{
        return invoke('fs_write_text_file', {{ path: path, content: content }});
      }},
      exists: function(path) {{
        return invoke('fs_exists', {{ path: path }});
      }}
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
