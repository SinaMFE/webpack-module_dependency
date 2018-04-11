const async = require("async");
const RawModule = require("webpack/lib/RawModule");
const path = require("path");
const fs = require("fs");
const process = require("process");

var gModuleVersion = {};
var projectPath = "";
var projectName = "";

function ModuleDependency(options) {

    this.options = options || {};
}

function loaderToIdent(data) {
    if (!data.options) return data.loader;
    if (typeof data.options === "string")
        return data.loader + "?" + data.options;
    if (typeof data.options !== "object")
        throw new Error("loader options must be string or object");
    if (data.ident) return data.loader + "??" + data.ident;
    return data.loader + "?" + JSON.stringify(data.options);
}

function identToLoaderRequest(resultString) {
    var idx = resultString.indexOf("?");
    var options;

    if (idx >= 0) {
        options = resultString.substr(idx + 1);
        resultString = resultString.substr(0, idx);

        return {
            loader: resultString,
            options: options
        };
    } else {
        return {
            loader: resultString
        };
    }
}

function getModuleNameByPath(path) {
    let pathList = path.split("node_modules/");
    let nums = pathList.length;
    if (nums == 1) {
        return path;
    }
    str = pathList[nums - 1];
    return formatModuleName(str);
}

function formatModuleName(str) {
    if (/^@/.test(str)) {
        // 带命名空间 私有仓库
        let nameList = str.match(/[^\/]*\/[^\/]*/);
        return nameList && nameList[0];
    } else {
        return str.split("/")[0];
    }
}

function canBundle(entryCallStack) {
    var result = {
        result: true,
        msg: []
    };
    for (var entry in entryCallStack) {
        for (var lib in entryCallStack[entry]) {
            libVersionNum = Object.keys(entryCallStack[entry][lib]).length;
            if (libVersionNum > 1) {
                // 依赖库不止一个版本
                result.result = false;
                result.msg.push(
                    "\nThere are " +
                        libVersionNum +
                        " version of " +
                        lib +
                        " in " +
                        entry +
                        " :"
                );
                for (version in entryCallStack[entry][lib]) {
                    result.msg.push("Version: " + version);
                    result.msg = result.msg.concat(
                        entryCallStack[entry][lib][version]
                    );
                }
            }
        }
    }
    return result;
}

function setProjectInfo(_path) {
    projectPath = _path;
    var packageJsonPath = path.resolve(projectPath, "package.json");
    var packageJSON = require(packageJsonPath);
    projectName = packageJSON.name;
}

function recursiveDependenceBuild(entry, prefix, callStack) {
    var prefix = prefix + "--> ";
    var deep = prefix.match(/-->/g).length; // 递归深度 超过十层默认为循环引用
    var loaderNum = prefix.match(/~babel-loader~/g)
        ? prefix.match(/~babel-loader~/g).length
        : 0;
    var parentModule = prefix.split("--> ")[deep - 1];
    deep = deep - loaderNum;
    var dependenceList = [];
    if (entry == null) {
        return dependenceList;
    }
    var dependencies = entry.dependencies;

    // 处理require.ensure加载进来的JS
    if (entry.blocks && entry.blocks.length !== 0) {
        entry.blocks.forEach(function(block) {
            // 如果需要把分出来的js文件在依赖树中标注出来，就在这里添加属性（找到文件名之类的），在下面dependencies循环中再处理
            dependencies = dependencies.concat(block.dependencies);
        });
    }

    var requireList = [
        "HarmonyImportDependency",
        "CommonJsRequireDependency",
        "AMDRequireDependency",
        "RequireEnsureItemDependency",
        "SingleEntryDependency",
        "HarmonyCompatibilityDependency",
        "HarmonyImportSpecifierDependency",
        "ConcatenatedModule"
    ];
    dependencies.forEach(function(dependence) {
        var originModule = dependence.originModule || dependence.module; // || dependence.importDependency && dependence.importDependency.module;
        if (originModule == null) {
            return;
        }
        if (entry == originModule) {
            // 处理重复引用问题
            return;
        }
        if (originModule.__proto__.constructor.name === "ConcatenatedModule") {
            // ConcatenatedModule的特殊性 获取不到绝对路径
            originModule = originModule.rootModule;
        }
        if (originModule.userRequest == null) {
            return;
        }
        if (deep + 1 !== originModule.depth) {
            // 处理深层依赖被扁平化  防止多显示一次
            return;
        }
        var type = dependence.__proto__.constructor.name;
        if (requireList.indexOf(type) !== -1) {
            var temp = {};
            temp.name = originModule.rawRequest || originModule.userRequest;
            temp.type = type === "AMDRequireDependency" ? "AMD" : "CMD";
            if (/^\./.test(temp.name)) {
                // 处理只能获取到相对路径的模块 例如client-jsbridge
                temp.name = getModuleNameByPath(originModule.userRequest);
            } else {
                // 1.
                // 兼容只引入模块的一部分 例如 import sncClass from "@mfelibs/client-jsbridge/src/sdk/core/sdk.js";
                // temp.name形如  /Users/zihao5/Desktop/Code/worldcup-home/node_modules/@mfelibs/client-jsbridge/src/sdk/core/sdk.js
                // 2.
                // loader处理的模块会被在此错误处理 但是没有影响 例如
                // !../../../node_modules/vue-loader/lib/component-normalizer
                // !!babel-loader?{"babelrc":false,"presets":["babel-preset-react-app"],"plugins":["transform-decorators-legacy"],"compact":true,"cacheDirectory":false,"highlightCode":true}!../../../node_modules/vue-loader/lib/selector?type=script&index=0!./index.vue
                temp.name = formatModuleName(temp.name);
            }
            if (temp.name === parentModule) {
                // 防止一些组件自身相对路径引用被识别为依赖  例如client-jsbridge
                return;
            }
            if (/^!!babel-loader/.test(temp.name)) {
                let index = originModule.userRequest.lastIndexOf(projectPath);
                temp.name = originModule.userRequest.substring(index);
                temp.extra = "babel-loader"; // 添加标识 防止被返回
            }
            if (gModuleVersion[temp.name]) {
                // 如果存在对应的依赖 比较路径 temp.name类似 @mfelibs/test-version-biz
                gModuleVersion[temp.name].forEach(function(subModule) {
                    if (subModule.path === originModule.userRequest) {
                        temp.version = subModule.version;
                    }
                });
            } else {
                // 如果不存在对应的依赖 可能是用户自定义的js   temp.name是js文件的绝对或相对地址
                // 例如入口文件中 import './index2'  temp.name为 ./index2
                // 这种情况下取当前工程的版本当做此文件的版本 并修正文件名为相对路径 因为绝对路径里的文件夹名不一定是工程名 且不同用户不一致
                gModuleVersion[projectName].forEach(function(subModule) {
                    if (subModule.path === temp.name) {
                        temp.version = subModule.version;
                        if (temp.extra) {
                            temp.name = temp.name.replace(
                                projectPath,
                                projectName + "~" + temp.extra + "~"
                            );
                            delete temp.extra;
                        } else {
                            temp.name = temp.name.replace(
                                projectPath,
                                projectName + "~"
                            );
                        }
                    }
                });
            }

            if (temp.version) {
                // 没有version 默认为引用的是该模块内置js文件或者公用模块，非第三方模块。  忽略掉，不在依赖树内显示
                // 直接忽略的另一个原因是 递归可能无法终止，因为引用的公共模块内又引了公共模块

                // callStack相关
                var tempPrefix = prefix + temp.name;
                callStack[temp.name] = callStack[temp.name] || {};
                if (callStack[temp.name][temp.version]) {
                    if (
                        callStack[temp.name][temp.version].indexOf(
                            tempPrefix
                        ) !== -1
                    ) {
                        // 已存在 已计算过一次
                        return;
                    } else {
                        callStack[temp.name][temp.version].push(tempPrefix);
                    }
                } else {
                    callStack[temp.name][temp.version] = [tempPrefix];
                }

                if (deep > 11) {
                    gModuleVersion.__stopBundle = true;
                    var msg =
                        "!!!Here may be a circular reference. Stop dependency graph build!!!";
                    temp.dependency = msg;
                    console.log(msg);
                    dependenceList.push(temp);
                    return;
                }

                temp.dependency = recursiveDependenceBuild(
                    originModule,
                    tempPrefix,
                    callStack
                );

                // dependenceList相关
                dependenceList.push(temp);
            }
        }
    });
    return dependenceList;
}

function setGModuleVersion(requests) {
    requests.forEach(function(request) {
        if (request == null) {
            return;
        }
        // if (request.path.indexOf('node_modules') === -1) {
        //   // 项目名称在compiler和compilation中皆获取不到
        //   // 所以在依赖的文件中 根据js路径判断是否是用户自定义js 非引入的第三方js
        //   // 若非第三方js即可判断为用户编写的js 从而可以在request中获取到项目名称
        //   gModuleVersion.__thisProjectName = request.descriptionFileData.name
        // }
        if (!gModuleVersion[request.descriptionFileData.name]) {
            gModuleVersion[request.descriptionFileData.name] = [
                {
                    path: request.path,
                    version: request.descriptionFileData.version
                }
            ];
        } else {
            var newVersion = false;
            gModuleVersion[request.descriptionFileData.name].forEach(function(
                subModule
            ) {
                if (
                    subModule.path !== request.path ||
                    subModule.version !== request.descriptionFileData.version
                ) {
                    newVersion = true;
                }
            });
            if (newVersion) {
                gModuleVersion[request.descriptionFileData.name].push({
                    path: request.path,
                    version: request.descriptionFileData.version
                });
            }
        }
    });
}

/**
 * options的参数
 * @param {String} scrop   cnpm scrop
 * @param {String} umdRegExp   用于匹配html中按照版本号发布umd的组件
 */
ModuleDependency.prototype.apply = function(compiler) {
    var options = this.options;
    options.scrop=options.scrop||"@mfelibs/";
    options.umdRegExp=options.umdRegExp||"(mjs.sinaimg.cn/umd/.*[\"'])";
    //check params

    var allRequests = [];
    compiler.plugin("normal-module-factory", function(nmf) {
        // 重写NormalModuleFactory.js内98行 为了得到request内的模块版本信息
        nmf.plugin("resolver", () => (data, callback) => {
            var _this = nmf;
            const contextInfo = data.contextInfo;
            const context = data.context;
            const request = data.request;

            const noAutoLoaders = /^-?!/.test(request);
            const noPrePostAutoLoaders = /^!!/.test(request);
            const noPostAutoLoaders = /^-!/.test(request);
            let elements = request
                .replace(/^-?!+/, "")
                .replace(/!!+/g, "!")
                .split("!");
            let resource = elements.pop();
            elements = elements.map(identToLoaderRequest);

            async.parallel(
                [
                    callback =>
                        _this.resolveRequestArray(
                            contextInfo,
                            context,
                            elements,
                            _this.resolvers.loader,
                            callback
                        ),
                    callback => {
                        if (resource === "" || resource[0] === "?")
                            return callback(null, {
                                resource
                            });

                        _this.resolvers.normal.resolve(
                            contextInfo,
                            context,
                            resource,
                            (err, resource, resourceResolveData) => {
                                if (err) return callback(err);
                                allRequests.push(resourceResolveData);
                                callback(null, {
                                    resourceResolveData,
                                    resource
                                });
                            }
                        );
                    }
                ],
                (err, results) => {
                    if (err) return callback(err);
                    let loaders = results[0];
                    const resourceResolveData = results[1].resourceResolveData;
                    resource = results[1].resource;

                    // translate option idents
                    try {
                        loaders.forEach(item => {
                            if (
                                typeof item.options === "string" &&
                                /^\?/.test(item.options)
                            ) {
                                const ident = item.options.substr(1);
                                item.options = _this.ruleSet.findOptionsByIdent(
                                    ident
                                );
                                item.ident = ident;
                            }
                        });
                    } catch (e) {
                        return callback(e);
                    }

                    if (resource === false) {
                        // ignored
                        return callback(
                            null,
                            new RawModule(
                                "/* (ignored) */",
                                `ignored ${context} ${request}`,
                                `${request} (ignored)`
                            )
                        );
                    }

                    const userRequest = loaders
                        .map(loaderToIdent)
                        .concat([resource])
                        .join("!");

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
                            if (
                                r.enforce === "post" &&
                                !noPostAutoLoaders &&
                                !noPrePostAutoLoaders
                            )
                                useLoadersPost.push(r.value);
                            else if (
                                r.enforce === "pre" &&
                                !noPrePostAutoLoaders
                            )
                                useLoadersPre.push(r.value);
                            else if (
                                !r.enforce &&
                                !noAutoLoaders &&
                                !noPrePostAutoLoaders
                            )
                                useLoaders.push(r.value);
                        } else {
                            settings[r.type] = r.value;
                        }
                    });
                    async.parallel(
                        [
                            _this.resolveRequestArray.bind(
                                this,
                                contextInfo,
                                _this.context,
                                useLoadersPost,
                                _this.resolvers.loader
                            ),
                            _this.resolveRequestArray.bind(
                                this,
                                contextInfo,
                                _this.context,
                                useLoaders,
                                _this.resolvers.loader
                            ),
                            _this.resolveRequestArray.bind(
                                this,
                                contextInfo,
                                _this.context,
                                useLoadersPre,
                                _this.resolvers.loader
                            )
                        ],
                        (err, results) => {
                            if (err) return callback(err);
                            loaders = results[0].concat(
                                loaders,
                                results[1],
                                results[2]
                            );
                            process.nextTick(() => {
                                callback(null, {
                                    context: context,
                                    request: loaders
                                        .map(loaderToIdent)
                                        .concat([resource])
                                        .join("!"),
                                    dependencies: data.dependencies,
                                    userRequest,
                                    rawRequest: request,
                                    loaders,
                                    resource,
                                    resourceResolveData,
                                    parser: _this.getParser(settings.parser)
                                });
                            });
                        }
                    );
                }
            );
        });
    });
    var reg = new RegExp(options.umdRegExp);

    // var reg = new RegExp("(mjs.sinaimg.cn/umd/.*[\"'])");
    var dependenceUMD = [];
    compiler.plugin("compilation", function(compilation) {
        compilation.plugin("optimize-chunk-assets", function(chunks, callback) {
            if (compilation.fileDependencies.length > 0) {
                for (var i = 0; i < compilation.fileDependencies.length; i++) {
                    if (compilation.fileDependencies[i].indexOf(".html") >= 0) {
                        var html = fs.readFileSync(
                            compilation.fileDependencies[i],
                            "utf-8"
                        );
                        var matchs = html.match(reg);
                        if (matchs == null || matchs.length == 0) {
                            continue;
                        }
                        if(!options.scrop){
                            options.scrop="";
                        }
                        for (var j = 0; j < matchs.length; j++) {
                            var array = matchs[j].toLowerCase().split("/");
                            if (array.length == 5) {
                                //严格匹配路径 "@mfelibs/"
                                var item =
                                options.scrop+
                                    array[2] + "|" + array[3];
                                if (dependenceUMD.indexOf(item) == -1) {
                                    dependenceUMD.push(item);
                                }
                                //2,3
                                // dependenceUMD.push({

                                // });
                            }
                        }
                    }
                }
            } //
            callback();
        });
    });
    compiler.plugin("emit", function(compilation, callback) {
        setProjectInfo(this.context);
        setGModuleVersion(allRequests);
        var dependencyGraph = [];
        var entryCallStack = {};

        compilation.chunks.forEach(function(chunk) {
            if (chunk.entryModule != null) {
                if (
                    Array.isArray(chunk.entryModule.dependencies) &&
                    chunk.entryModule.dependencies.length > 1
                ) {
                    // 第一项为 工程化公共的模块
                    // 工程化公共的模块 看是否有需求需要加入 可统计到 promise-polyfill object-assign
                    var entryPub = {
                        entry: "webpack-marauder-public"
                    };
                    entryCallStack[entryPub.entry] = {};
                    entryPub.dependency = recursiveDependenceBuild(
                        chunk.entryModule.dependencies[0].module,
                        entryPub.entry,
                        entryCallStack[entryPub.entry]
                    );
                    // 不单独区分
                    // dependencyGraph.push(entryPub)

                    // 第二项为 入口模块
                    var entry = {};
                    entry.entry = chunk.name; // 入口名
                    entryCallStack[entry.entry] = {};
                    entry.dependency = recursiveDependenceBuild(
                        chunk.entryModule.dependencies[1].module,
                        entry.entry,
                        entryCallStack[entry.entry]
                    );
                    // 合并共用组件
                    entry.dependency = entryPub.dependency.concat(
                        entry.dependency
                    );
                    dependencyGraph.push(entry);
                }
            }
        });
        var result = canBundle(entryCallStack);
        if (result.result) {
            // 无版本冲突 生成依赖树文件 正常执行后续操作
            for (var i = 0; i < dependenceUMD.length; i++) {
                dependenceUMD[i] = {
                    name: dependenceUMD[i].split("|")[0],
                    type: "UMD",
                    version: dependenceUMD[i].split("|")[1],
                    dependency: []
                };
            }
            dependencyGraph[0].dependency = dependencyGraph[0].dependency.concat(
                dependenceUMD
            );
            var dependencyGraphJsonStr = JSON.stringify(dependencyGraph);
            dependencyGraph.forEach(function(eachEntry) {
                var graphPath = "dependencyGraph.json";
                compilation.assets[graphPath] = {
                    source: function() {
                        return dependencyGraphJsonStr;
                    },
                    size: function() {
                        return dependencyGraphJsonStr.length;
                    }
                };
                var outputPath = path.join(
                    compilation.outputOptions.path,
                    graphPath
                );
            });
            callback();
        } else {
            // 可能有循环引用 终止打包
            console.error("\n\n---Version conflict---");
            result.msg.forEach(function(msg) {
                console.log(msg);
            });
            console.log(
                "\n---End bundle! Please make sure your libs has no version conflict!---"
            );
            console.log(
                "---If you have any questions, please contact zihao5@---\n"
            );
            process.exit(1);
        }
    });
};

module.exports = ModuleDependency;
