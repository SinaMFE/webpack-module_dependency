var async = require('async')
var RawModule = require('webpack/lib/RawModule')
var path = require('path')
var fs = require('fs')
var process = require('process')

var moduleVersions = {}; // 安装的全部依赖版本了
var moduleVersionsUsed = {}; // 实际使用的
/*
var moduleVersions = {
  "111": {
    "0.1.0": Set(3) {"/Users/zihao5/Desktop/Test/wajuejiProject/src/view/index/index.html", "/Users/zihao5/Desktop/Test/wajuejiProject/src/view/index/index.js", "/Users/zihao5/Desktop/Test/wajuejiProject/src/view/index/test.mustache"}
  },
  "webpack-marauder": {
    "1.8.0": {}
  },
  "promise-polyfill": {
    "6.1.0": {}
  },
  "object-assign": {
    "4.1.1": {}
  },
  "js-infinite-scroller": {
    "0.1.0": {}
  },
  "@mfelibs/base-utils": {
    "1.5.3": {}
  },
  "@mfelibs/base-tools-SIMA": {
    "0.0.22": {},
    "0.0.23": {}
  },
  "@mfelibs/base-tools-lazyload": {
    "1.5.91-rc": {}
  },
  "hogan.js": {
    "3.0.2": {}
  }
}
*/
function getModuleName(str) {
  if (/^@/.test(str)) {
    // 带命名空间 私有仓库
    let nameList = str.match(/[^\/]*\/[^\/]*/);
    return nameList && nameList[0]
  } else {
    return str.split('/')[0]
  }
}

function getModuleVersion(path, name) {
  let thisVersion = '';
  let allThisModuleVersion = moduleVersions[name];
  for (let version in allThisModuleVersion) {
    allThisModuleVersion[version].forEach(_path => {
      if (path === _path) {
        thisVersion = version;

        // 存储实际使用的模块
        moduleVersionsUsed[name] = moduleVersionsUsed[name] || {};
        moduleVersionsUsed[name][version] = moduleVersionsUsed[name][version] || [];
        if (moduleVersionsUsed[name][version].indexOf(_path) === -1) {
          moduleVersionsUsed[name][version].push(_path)
        }
      }
    })
  }
  return thisVersion
}

/**
 * 
 * @param {Object} oj 
 * @param {String} path 
 * @param {number} index 初始时传1 表示第一层的依赖
 */
function findByIndex(oj, path, index) {
  let temp = path.split('node_modules/');
  let nums = temp.length;
  if (nums < index + 1) {
    return;
  }
  let name = getModuleName(temp[index]);
  let version = getModuleVersion(path, name);
  let thisModuleInfo = {
    "name": name,
    "type": "CMD",
    "version": version,
    "dependency": []
  }
  // console.log(name, version, index);
  if (nums === index + 1) {
    let unique = 1;
    oj.dependency.forEach(dep => {
      if (dep.name === name && dep.version === version) {
        unique = 0;
      }
    })
    unique && oj.dependency.push(thisModuleInfo);
  } else {
    oj.dependency.forEach(dep => {
      if (dep.name === name) {
        findByIndex(dep, path, ++index)
      }
    })
  }
}

function ModuleDependency() {}

function loaderToIdent(data) {
  if (!data.options) return data.loader
  if (typeof data.options === 'string') return data.loader + '?' + data.options
  if (typeof data.options !== 'object')
    throw new Error('loader options must be string or object')
  if (data.ident) return data.loader + '??' + data.ident
  return data.loader + '?' + JSON.stringify(data.options)
}

function identToLoaderRequest(resultString) {
  var idx = resultString.indexOf('?')
  var options

  if (idx >= 0) {
    options = resultString.substr(idx + 1)
    resultString = resultString.substr(0, idx)

    return {
      loader: resultString,
      options: options
    }
  } else {
    return {
      loader: resultString
    }
  }
}

function canBundle() {
  var result = {
    result: true,
    msg: []
  }
  for (var comp in moduleVersionsUsed) {
    var compVersions = Object.keys(moduleVersionsUsed[comp]); // ['1.8.0', '1.7.0']
    var libVersionNum = compVersions.length;
    if (libVersionNum > 1) {
      // 依赖库不止一个版本
      result.result = false

      result.msg.push(
        '\nThere are ' +
        libVersionNum +
        ' version of ' +
        comp +
        // ' in ' +
        // entry +
        ' :'
      )
      compVersions.forEach(version => {
        result.msg.push('Version: ' + version);
        result.msg = result.msg.concat(moduleVersionsUsed[comp][version])
      })
    }
  }
  return result
}

function setModuleVersion(allRequests) {
  allRequests.forEach(singleModule => {
    // 获取版本
    let path = singleModule.path;
    let name = singleModule.descriptionFileData && singleModule.descriptionFileData.name;
    let version = singleModule.descriptionFileData && singleModule.descriptionFileData.version;

    // 存储版本信息
    moduleVersions[name] = moduleVersions[name] || {};
    moduleVersions[name][version] = moduleVersions[name][version] || new Set();
    moduleVersions[name][version].add(path);
  })
}

ModuleDependency.prototype.apply = function(compiler) {
  var allRequests = []
  compiler.plugin('normal-module-factory', function(nmf) {
    // 重写NormalModuleFactory.js内98行 为了得到request内的模块版本信息
    nmf.plugin("resolver", () => (data, callback) => {
      var _this = nmf
      const contextInfo = data.contextInfo;
      const context = data.context;
      const request = data.request;

      const noAutoLoaders = /^-?!/.test(request);
      const noPrePostAutoLoaders = /^!!/.test(request);
      const noPostAutoLoaders = /^-!/.test(request);
      let elements = request.replace(/^-?!+/, "").replace(/!!+/g, "!").split("!");
      let resource = elements.pop();
      elements = elements.map(identToLoaderRequest);

      async.parallel([
        callback => _this.resolveRequestArray(contextInfo, context, elements, _this.resolvers.loader, callback),
        callback => {
          if (resource === "" || resource[0] === "?")
            return callback(null, {
              resource
            });

          _this.resolvers.normal.resolve(contextInfo, context, resource, (err, resource, resourceResolveData) => {
            if (err) return callback(err);
            allRequests.push(resourceResolveData);
            callback(null, {
              resourceResolveData,
              resource
            });
          });
        }
      ], (err, results) => {
        if (err) return callback(err);
        let loaders = results[0];
        const resourceResolveData = results[1].resourceResolveData;
        resource = results[1].resource;

        // translate option idents
        try {
          loaders.forEach(item => {
            if (typeof item.options === "string" && /^\?/.test(item.options)) {
              const ident = item.options.substr(1);
              item.options = _this.ruleSet.findOptionsByIdent(ident);
              item.ident = ident;
            }
          });
        } catch (e) {
          return callback(e);
        }

        if (resource === false) {
          // ignored
          return callback(null,
            new RawModule(
              "/* (ignored) */",
              `ignored ${context} ${request}`,
              `${request} (ignored)`
            )
          );
        }

        const userRequest = loaders.map(loaderToIdent).concat([resource]).join("!");

        let resourcePath = resource;
        let resourceQuery = "";
        const queryIndex = resourcePath.indexOf("?");
        if (queryIndex >= 0) {
          resourceQuery = resourcePath.substr(queryIndex);
          resourcePath = resourcePath.substr(0, queryIndex);
        }

        const result = _this.ruleSet.exec({
          resource: resourcePath,
          resourceQuery,
          issuer: contextInfo.issuer,
          compiler: contextInfo.compiler
        });
        const settings = {};
        const useLoadersPost = [];
        const useLoaders = [];
        const useLoadersPre = [];
        result.forEach(r => {
          if (r.type === "use") {
            if (r.enforce === "post" && !noPostAutoLoaders && !noPrePostAutoLoaders)
              useLoadersPost.push(r.value);
            else if (r.enforce === "pre" && !noPrePostAutoLoaders)
              useLoadersPre.push(r.value);
            else if (!r.enforce && !noAutoLoaders && !noPrePostAutoLoaders)
              useLoaders.push(r.value);
          } else {
            settings[r.type] = r.value;
          }
        });
        async.parallel([
          _this.resolveRequestArray.bind(this, contextInfo, _this.context, useLoadersPost, _this.resolvers.loader),
          _this.resolveRequestArray.bind(this, contextInfo, _this.context, useLoaders, _this.resolvers.loader),
          _this.resolveRequestArray.bind(this, contextInfo, _this.context, useLoadersPre, _this.resolvers.loader)
        ], (err, results) => {
          if (err) return callback(err);
          loaders = results[0].concat(loaders, results[1], results[2]);
          process.nextTick(() => {
            callback(null, {
              context: context,
              request: loaders.map(loaderToIdent).concat([resource]).join("!"),
              dependencies: data.dependencies,
              userRequest,
              rawRequest: request,
              loaders,
              resource,
              resourceResolveData,
              parser: _this.getParser(settings.parser)
            });
          });
        });
      });
    });
  })
  var reg = new RegExp('(mjs.sinaimg.cn/umd/.*["\'])')
  var dependenceUMD = [];

  compiler.plugin('compilation', function(compilation) {
    compilation.plugin('optimize-chunk-assets', function(chunks, callback) {
      if (compilation.fileDependencies.length > 0) {
        for (var i = 0; i < compilation.fileDependencies.length; i++) {
          if (compilation.fileDependencies[i].indexOf('.html') >= 0) {
            var html = fs.readFileSync(compilation.fileDependencies[i], 'utf-8')
            var matchs = html.match(reg)
            if (matchs == null || matchs.length == 0) {
              continue
            }
            for (var j = 0; j < matchs.length; j++) {
              var array = matchs[j].toLowerCase().split('/')
              if (array.length == 5) {
                //严格匹配路径
                var item = '@mfelibs/' + array[2] + '|' + array[3]
                if (dependenceUMD.indexOf(item) == -1) {
                  dependenceUMD.push(item)
                }
                //2,3
                // dependenceUMD.push({

                // });
              }
            }
          }
        }
      } //
      callback()
    })
  })
  compiler.plugin('emit', function(compilation, callback) {
    setModuleVersion(allRequests)

    var dependencyGraph = []
    var entryCallStack = {}
    compilation.chunks.forEach(function(chunk) {
      let saveByNums = [];
      let entry = {}
      let entryModule = chunk.entryModule;
      if (entryModule) {
        entry.entry = chunk.name // 入口名
        entry.dependency = []
        entryModule.dependencies.forEach(dependence => {
          let _module = dependence.module;
          _module && _module.fileDependencies && _module.fileDependencies.forEach(path => {
            // path 形如   
            // "/Users/zihao5/Desktop/Test/wajuejiProject/node_modules/@mfelibs/base-utils/src/zepto.js"
            // "/Users/zihao5/Desktop/Test/wajuejiProject/node_modules/@mfelibs/base-tools-lazyload/node_modules/@mfelibs/base-tools-SIMA/src/index.js"
            let temp = path.split('node_modules/');
            let nums = temp.length;

            // 按依赖深度存储 保证找依赖更深的层级时能找到上级组件
            if (saveByNums[nums]) {
              saveByNums[nums].push(path)
            } else {
              saveByNums[nums] = [path];
            }
          })
        })
      }

      saveByNums.splice(0, 2); // 删除前两项  第一项为空  第二项为非node_modules的元素
      saveByNums.forEach(pathList => {
        pathList.forEach(path => {
          findByIndex(entry, path, 1);
        })
      })

      dependencyGraph.push(entry);
    })
    var result = canBundle(dependencyGraph);
    if (!result.result) {
      // 可能有循环引用 终止打包
      console.error('\n\n---Version conflict---')
      result.msg.forEach(function(msg) {
        console.log(msg)
      })
      console.log(
        '\n---End bundle! Please make sure your libs has no version conflict!---'
      )
      console.log(
        '---If you have any questions, please contact zihao5@staff.sina.com.cn---\n'
      )
      process.exit(1)
    } else {
      // 无版本冲突 生成依赖树文件 正常执行后续操作
      for (var i = 0; i < dependenceUMD.length; i++) {
        dependenceUMD[i] = {
          name: dependenceUMD[i].split('|')[0],
          type: 'UMD',
          version: dependenceUMD[i].split('|')[1],
          dependency: []
        }
      }
      dependencyGraph[0].dependency = dependencyGraph[0].dependency.concat(
        dependenceUMD
      )
      var dependencyGraphJsonStr = JSON.stringify(dependencyGraph)
      dependencyGraph.forEach(function(eachEntry) {
        var graphPath = 'dependencyGraph.json'
        compilation.assets[graphPath] = {
          source: function() {
            return dependencyGraphJsonStr
          },
          size: function() {
            return dependencyGraphJsonStr.length
          }
        }
      })
      callback()
    }

  })
}

module.exports = ModuleDependency