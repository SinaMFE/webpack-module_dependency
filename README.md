# webpack-module_dependency
webpack-marauder 依赖树插件


这个分支是按照老逻辑来寻找的  
但是找dependencies时被扁平化了  
例如  
依赖关系：  
entry -> test-npm-module-react -> react @15.6.2  
      -> react @16.2.0  

找entry的dependencies时，数组顺序  
[ test-npm-module-react, react (@15.6.2), react (@16.2.0) ]

