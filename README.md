[![npm][npm]][npm-url]
[![node][node]][node-url]
[![deps][deps]][deps-url]
[![tests][tests]][tests-url]


# webpack-module_dependency
webpack 依赖树插件

## 作用

### 收集组件依赖关系，用于数据分析，组件依赖分析，反向查找依赖工程

### 用于前端工程中严格的多版本问题排重终止打包操作。



### 一些说明
一、 按照entry的dependencies递归查找
但是找dependencies时被扁平化了
例如
依赖关系：
entry -> test-npm-module-react -> react @15.6.2
      -> react @16.2.0

找entry的dependencies时，数组顺序
[ test-npm-module-react, react (@15.6.2), react (@16.2.0) ]

加了一层依赖深度的检测

~~二、 忽略了工程化本身的依赖~~
~~例如在entry的dependencies中可以找到两类依赖，除了工程本身的依赖还可以获取是webpack-marauder相关的公有依赖，可以找到promise-polyfill@6.1.0 object-assign@4.1.1。这类忽略掉了~~

三、 webpack-marauder升级可能会导致依赖树变化，需要对应检查  



### 更新流程  


```
git add .
git cz
```

Run the npm version [`npm version [path|minor|major]`](https://docs.npmjs.com/cli/version) command

```
//发小补丁
npm version patch -m 'commit message'

//发小版本
npm version minor -m 'commit message'

//发小版本
npm version major -m 'commit message'

```

```
cnpm publish
```

Push

```
git push
```




[npm]: https://img.shields.io/npm/v/sinamfe-webpack-module_dependency.svg

[npm-url]: https://npmjs.com/package/sinamfe-webpack-module_dependency

[node]: https://img.shields.io/node/v/sinamfe-webpack-module_dependency.svg
[node-url]: https://nodejs.org

[deps]: https://david-dm.org/SinaMFE/sinamfe-webpack-module_dependency.svg
[deps-url]: https://david-dm.org/SinaMFE/sinamfe-webpack-module_dependency

[tests]: http://img.shields.io/travis/SinaMFE/sinamfe-webpack-module_dependency.svg
[tests-url]: https://travis-ci.org/SinaMFE/sinamfe-webpack-module_dependency

[cover]: https://img.shields.io/codecov/c/github/SinaMFE/sinamfe-webpack-module_dependency.svg
[cover-url]: https://codecov.io/gh/SinaMFE/sinamfe-webpack-module_dependency

[chat]: https://badges.gitter.im/webpack/webpack.svg
[chat-url]: https://gitter.im/webpack/webpack
