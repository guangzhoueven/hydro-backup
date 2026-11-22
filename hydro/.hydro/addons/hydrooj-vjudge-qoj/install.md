先安装 @hydrooj/vjudge 插件（已经安装省略此步）和 [QOJ 远端评测插件](https://github.com/Molmin/miniprojects/tree/master/hydrooj-vjudge-qoj)：

```sh
yarn global add @hydrooj/vjudge
hydrooj addon add @hydrooj/vjudge
yarn global add hydrooj-vjudge-qoj
hydrooj addon add hydrooj-vjudge-qoj
```

接下来创建名为 `qoj` 的域：

```sh
hydrooj cli domain add qoj 2 qoj qoj
```

然后使用 `hydrooj db` 进入数据库，执行（其中加密的密码需要按照 [此文](https://hydro.ac/d/faqs/p/13) 中 UOJ 的方法获取）：

```js
db.vjudge.mount.insert({mount:'qoj',_id:'qoj'});
db.vjudge.insert({type:'qoj', handle:'<USERNAME>', password:'<ENCRYPTED_PASSWORD>'});
```

在控制面板 / 语言设置的末尾加入下面的内容：

```yaml
qoj:
  display: QOJ
  domain:
  - qoj
qoj.C++98:
  highlight: cpp astyle-c
  monaco: cpp
  display: C++ 98
  comment: //
qoj.C++11:
  highlight: cpp astyle-c
  monaco: cpp
  display: C++ 11
  comment: //
qoj.C++14:
  highlight: cpp astyle-c
  monaco: cpp
  display: C++ 14
  comment: //
qoj.C++17:
  highlight: cpp astyle-c
  monaco: cpp
  display: C++ 17
  comment: //
qoj.C++20:
  highlight: cpp astyle-c
  monaco: cpp
  display: C++ 20
  comment: //
qoj.C++23:
  highlight: cpp astyle-c
  monaco: cpp
  display: C++ 23
  comment: //
qoj.D:
  highlight: d
  monaco: plain
  display: D
  comment: //
qoj.Python3:
  highlight: python
  monaco: python
  display: Python 3
  comment: '#'
qoj.Java8:
  highlight: java astyle-java
  monaco: java
  display: Java 8
  comment: //
qoj.Java11:
  highlight: java astyle-java
  monaco: java
  display: Java 11
  comment: //
qoj.Pascal:
  highlight: pascal
  monaco: pascal
  display: Pascal
  comment: //
qoj.Rust:
  highlight: rust
  monaco: rust
  display: Rust
  comment: //
```

然后在 QOJ 域的管理域 / 编辑域资料 / 域内允许使用的提交语言中添加如下语言

```plain
qoj,qoj.C++98,qoj.C++11,qoj.C++14,qoj.C++17,qoj.C++20,qoj.C++23,qoj.D,qoj.Python3,qoj.Java8,qoj.Java11,qoj.Pascal,qoj.Rust
```

如果无法粘贴，也可以手动选择所有前缀 QOJ 的语言。

然后使用 `pm2 restart hydrooj` 重启服务，观察题目是否出现，并任意提交一个题目测试即可。

注意：

- 由于部分题目需要提交多个文件，所有暂时不支持这些题目的评测。
- 部分题目有语言限制（例如大部分函数式交互题），这类题目中提交其他语言会导致 System Error。
- 提交频率过快也可能导致 System Error。
