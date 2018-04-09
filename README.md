# webpack-module_dependency
webpack-marauder 依赖树插件


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
