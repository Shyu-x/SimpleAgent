# Go 语言新手教程

## 目录

1. [什么是编程？](#什么是编程)
2. [为什么选择 Go？](#为什么选择-go)
3. [安装 Go](#安装-go)
4. [第一个 Go 程序](#第一个-go-程序)
5. [Go 基础语法](#go-基础语法)
6. [变量和数据类型](#变量和数据类型)
7. [控制流程](#控制流程)
8. [函数](#函数)
9. [结构体和方法](#结构体和方法)
10. [接口](#接口)
11. [并发编程](#并发编程)
12. [错误处理](#错误处理)
13. [常用标准库](#常用标准库)

---

## 什么是编程？

### 打个比方

想象你有一只会听话的宠物（比如一只聪明的狗）。你可以说：

- "坐下" → 狗会坐下
- "握手" → 狗会伸出爪子

编程就像这样，**你用一种特殊的语言（编程语言）给计算机下命令**，计算机会按照你的命令执行。

### 编程语言有哪些？

| 语言 | 比喻 | 用途 |
|------|------|------|
| 中文 | 和中国人交流 | 主要用于中国人之间对话 |
| 英文 | 和英语国家的人交流 | 国际通用 |
| Python | 简单易学的外语 | AI、数据分析、网站 |
| JavaScript | 网络世界的外语 | 网站前端 |
| Go | 高效的多语言翻译 | 服务器、云计算 |
| Java | 商业会议用语 | 企业应用、Android |

---

## 为什么选择 Go？

### Go 的优势

| 优势 | 说明 | 比喻 |
|------|------|------|
| **简单易学** | 语法少，规则清晰 | 像学自行车，比学汽车简单 |
| **运行速度快** | 编译成机器码，直接执行 | 像高铁和汽车，专用轨道更快 |
| **天然支持并发** | 同时做多件事 | 一边炒菜一边煮饭 |
| **跨平台** | Windows、Mac、Linux都能跑 | 普通话在全国都能用 |
| **生态丰富** | 很多现成的工具 | 拼装积木，不用从零做 |

### Go 能做什么？

```
┌─────────────────────────────────────────────────┐
│                    Go 能做的                     │
├─────────────────────────────────────────────────┤
│  🌐 网站后端        - 服务器、网站接口           │
│  ☁️  云服务        - 容器编排（Docker/K8s）    │
│  📊 数据处理       - 高速数据处理管道            │
│  🤖 AI 服务        - AI 模型部署、推理服务      │
│  🔧 工具软件       - 命令行工具、编译器         │
│  📱 微服务         - 微服务架构                  │
└─────────────────────────────────────────────────┘
```

---

## 安装 Go

### 第一步：下载

打开浏览器，访问：**https://go.dev/dl/**

根据你的电脑选择：
- **Windows** → 点击 `go1.21.x.windows-amd64.msi`
- **Mac** → 点击 `go1.21.x.darwin-arm64.pkg` 或 `.darwin-amd64.pkg`
- **Linux** → 点击 `go1.21.x.linux-amd64.tar.gz`

### 第二步：安装

**Windows 用户：**
1. 双击下载的 `.msi` 文件
2. 一路点 "Next"（下一步）
3. 完成！

**Mac 用户：**
1. 双击下载的 `.pkg` 文件
2. 按提示操作
3. 完成！

### 第三步：验证安装

打开 **命令行/终端**，输入：

```bash
go version
```

如果看到类似这样的输出，就说明安装成功了：

```
go version go1.21.5 windows/amd64
```

### 第四步：配置环境（可选）

对于 Windows 用户，安装程序通常会自动配置好。

如果不行，手动添加：
1. 右键 "此电脑" → 属性 → 高级系统设置
2. 点击 "环境变量"
3. 在 "系统变量" 中找到 "Path"
4. 添加 `C:\Go\bin`（如果安装在这个位置）

---

## 第一个 Go 程序

### 第一步：创建文件夹

在合适的位置创建一个文件夹，比如：
- Windows: `C:\Users\你的名字\go_projects`
- Mac/Linux: `~/go_projects`

### 第二步：创建代码文件

在文件夹里创建一个文件，名字叫 `hello.go`

**注意：** 文件名必须以 `.go` 结尾！

### 第三步：写代码

用任何文本编辑器打开 `hello.go`，输入以下内容：

```go
package main

import "fmt"

func main() {
    fmt.Println("Hello, World!")
}
```

### 第四步：运行

在命令行中进入这个文件夹，然后运行：

```bash
cd 你创建文件夹的路径
go run hello.go
```

你应该会看到：

```
Hello, World!
```

### 代码解释

| 代码 | 含义 | 解释 |
|------|------|------|
| `package main` | 包声明 | 告诉计算机这是主程序入口 |
| `import "fmt"` | 导入包 | 引入"格式化输出"功能 |
| `func main()` | 主函数 | 程序从这里开始执行 |
| `fmt.Println(...)` | 打印输出 | 把括号里的内容显示出来 |

---

## Go 基础语法

### 注释

注释是给人看的说明，不会被执行。

```go
// 这是单行注释

/*
   这是多行注释
   可以写很多行
*/
```

### 标识符

标识符就是给东西起的名字，比如变量名、函数名。

**规则：**
- 必须以字母或下划线 `_` 开头
- 后面可以是字母、数字、下划线
- 大小写敏感（`Name` 和 `name` 是不同的）

**好的命名示例：**
```go
name       // 变量名
userName   // 用户名（驼峰命名）
UserName   // 用户名（帕斯卡命名）
MAX_SIZE   // 常量（全大写）
```

### 关键字

Go 有 25 个保留关键字，不能用作标识符：

```
break       case        chan        const       continue
default     defer       else        fallthrough for
func        go          goto        if          import
interface   map         package     range       return
select      struct      switch      type        var
```

---

## 变量和数据类型

### 变量的概念

**变量就像一个盒子，里面可以放东西。**

```
    ┌─────────┐
    │   盒子   │  ← 变量
    │   42    │  ← 值
    └─────────┘
         ↑
       name  ← 名字（变量名）
```

### 声明变量的三种方式

#### 方式一：指定类型

```go
var age int       // 声明一个整数变量
age = 25          // 给变量赋值

var name string   // 声明一个字符串变量
name = "Alice"   // 给变量赋值
```

#### 方式二：自动推断类型

```go
var age = 25          // 自动推断为 int
var name = "Alice"    // 自动推断为 string
```

#### 方式三：简短声明（常用）

```go
age := 25       // 整数
name := "Alice" // 字符串
isStudent := true // 布尔值
```

### 常用数据类型

| 类型 | 说明 | 示例 |
|------|------|------|
| `int` | 整数 | `25`, `-100`, `0` |
| `float64` | 浮点数（小数） | `3.14`, `-0.5` |
| `string` | 字符串（文本） | `"Hello"`, `"你好"` |
| `bool` | 布尔值（真假） | `true`, `false` |
| `byte` | 字节 | `'A'`, `65` |

### 代码示例

```go
package main

import "fmt"

func main() {
    // 整数
    age := 25
    fmt.Println("年龄:", age)

    // 浮点数
    height := 1.75
    fmt.Println("身高:", height)

    // 字符串
    name := "Alice"
    fmt.Println("名字:", name)

    // 布尔值
    isStudent := true
    fmt.Println("是学生:", isStudent)

    // 多个变量
    x, y := 10, 20
    fmt.Println("x + y =", x + y)
}
```

---

## 控制流程

### 顺序执行

默认情况下，代码从上往下依次执行：

```go
fmt.Println("第一步")
fmt.Println("第二步")
fmt.Println("第三步")
```

### 条件判断 if

```go
age := 18

if age >= 18 {
    fmt.Println("成年了！")
} else {
    fmt.Println("还是未成年人")
}
```

**if 还可以这样用：**

```go
score := 85

if score >= 90 {
    fmt.Println("优秀")
} else if score >= 60 {
    fmt.Println("及格")
} else {
    fmt.Println("不及格")
}
```

### 循环 for

Go 只有一种循环关键字 `for`：

```go
// 基本循环
for i := 1; i <= 5; i++ {
    fmt.Println("第", i, "次")
}

// 打印 1 到 10 的和
sum := 0
for i := 1; i <= 10; i++ {
    sum += i
}
fmt.Println("1+2+...+10 =", sum)

// 死循环（需要配合 break 使用）
i := 0
for {
    i++
    if i > 5 {
        break // 退出循环
    }
    fmt.Println(i)
}
```

### switch 多分支

```go
day := 3

switch day {
case 1:
    fmt.Println("星期一")
case 2:
    fmt.Println("星期二")
case 3:
    fmt.Println("星期三")
default:
    fmt.Println("其他")
}
```

---

## 函数

### 什么是函数？

**函数就像一个机器，你放原料进去，它帮你加工，然后输出结果。**

```
    ┌─────────────┐
    │   函数      │
    │             │
    │  输入 → 处理 │
    │      ↓      │
    │    输出     │
    └─────────────┘
```

### 定义函数

```go
// 无参数无返回值
func sayHello() {
    fmt.Println("Hello!")
}

// 有参数
func greet(name string) {
    fmt.Println("Hello,", name)
}

// 有返回值
func add(a int, b int) int {
    return a + b
}

// 多个返回值（Go 特色）
func divide(a, b float64) (float64, error) {
    if b == 0 {
        return 0, fmt.Errorf("除数不能为0")
    }
    return a / b, nil
}
```

### 使用函数

```go
package main

import "fmt"

// 定义函数
func max(a, b int) int {
    if a > b {
        return a
    }
    return b
}

func main() {
    // 调用函数
    result := max(10, 20)
    fmt.Println("最大值:", result)  // 输出: 20
}
```

### 变长参数

```go
func sum(numbers ...int) int {
    total := 0
    for _, n := range numbers {
        total += n
    }
    return total
}

func main() {
    fmt.Println(sum(1, 2, 3))       // 6
    fmt.Println(sum(1, 2, 3, 4, 5)) // 15
}
```

---

## 结构体和方法

### 结构体 struct

**结构体就像一个自定义的数据类型，把相关的信息组合在一起。**

```go
// 定义结构体
type Person struct {
    Name    string
    Age     int
    Address string
}

func main() {
    // 创建结构体实例
    p := Person{
        Name:    "Alice",
        Age:     25,
        Address: "北京",
    }

    // 访问字段
    fmt.Println("姓名:", p.Name)
    fmt.Println("年龄:", p.Age)

    // 修改字段
    p.Age = 26
    fmt.Println("新年龄:", p.Age)
}
```

### 方法 method

**方法是绑定到结构体上的函数。**

```go
type Person struct {
    Name string
    Age  int
}

// 这是普通函数
func birthday(person *Person) {
    person.Age++
}

// 这是方法（绑定到 Person 上）
func (p *Person) birthday() {
    p.Age++
}

func main() {
    p := Person{Name: "Alice", Age: 25}

    // 调用函数
    birthday(&p)
    fmt.Println("函数调用后年龄:", p.Age)  // 26

    // 调用方法
    p.birthday()
    fmt.Println("方法调用后年龄:", p.Age)  // 27
}
```

### 为什么要用指针？

```go
func byValue(p Person) {
    p.Age = 100  // 修改的是副本，不影响原值
}

func byPointer(p *Person) {
    p.Age = 100  // 修改的是原值
}

func main() {
    p := Person{Name: "Alice", Age: 25}

    byValue(p)
    fmt.Println(p.Age)  // 25，不变！

    byPointer(&p)
    fmt.Println(p.Age)  // 100，变了！
}
```

---

## 接口

### 什么是接口？

**接口定义了一套规则，表示"谁能做什么"，不关心"怎么做"。**

### 接口的定义和使用

```go
// 定义接口
type Speaker interface {
    Speak() string  // 必须实现这个方法
}

// 结构体实现接口
type Dog struct{}

func (d Dog) Speak() string {
    return "汪汪汪！"
}

type Cat struct{}

func (c Cat) Speak() string {
    return "喵喵喵！"
}

// 使用接口
func introduce(s Speaker) {
    fmt.Println(s.Speak())
}

func main() {
    dog := Dog{}
    cat := Cat{}

    introduce(dog)  // 输出: 汪汪汪！
    introduce(cat) // 输出: 喵喵喵！
}
```

### 空接口

空接口 `interface{}` 可以接受任何类型：

```go
func printAnything(v interface{}) {
    fmt.Println(v)
}

func main() {
    printAnything(42)
    printAnything("hello")
    printAnything(true)
}
```

---

## 并发编程

### 什么是并发？

| 概念 | 比喻 | 说明 |
|------|------|------|
| 串行 | 一个人洗碗→洗完再做饭 | 一件一件做 |
| 并发 | 边洗碗边让电饭煲煮饭 | 看起来同时做 |
| 并行 | 两个人同时洗碗 | 真正同时做 |

### goroutine 协程

**goroutine 是 Go 轻量级的执行单元，比线程更轻量。**

```go
import "time"

func task(name string) {
    for i := 1; i <= 3; i++ {
        fmt.Println(name, "执行第", i, "次")
        time.Sleep(100 * time.Millisecond)
    }
}

func main() {
    // 串行执行
    fmt.Println("=== 串行 ===")
    task("A")
    task("B")

    fmt.Println("=== 并发 ===")
    // 并发执行
    go task("A")  // 注意这里的 go 关键字
    go task("B")

    // 等待协程完成
    time.Sleep(1 * time.Second)
    fmt.Println("完成！")
}
```

### channel 通道

**通道是 goroutine 之间通信的桥梁。**

```
    goroutine A                      goroutine B
         │                                │
         ├───── chan (通道) ──────────────┤
         │                                │
         └────────────────────────────────┘
```

```go
func producer(ch chan int) {
    ch <- 1  // 发送数据
    ch <- 2
    ch <- 3
    close(ch)  // 关闭通道
}

func main() {
    // 创建通道
    ch := make(chan int)

    // 启动生产者
    go producer(ch)

    // 接收数据
    for v := range ch {
        fmt.Println("收到:", v)
    }
    fmt.Println("通道关闭")
}
```

### select 多通道

```go
func main() {
    ch1 := make(chan string)
    ch2 := make(chan string)

    go func() { ch1 <- "消息1" }()
    go func() { ch2 <- "消息2" }()

    // 等待最快到达的消息
    select {
    case msg1 := <-ch1:
        fmt.Println("收到:", msg1)
    case msg2 := <-ch2:
        fmt.Println("收到:", msg2)
    }
}
```

---

## 错误处理

### Go 的错误处理哲学

Go 鼓励显式处理错误，不像 Java/Python 那样用异常。

```go
// Go 的风格
result, err := doSomething()
if err != nil {
    // 处理错误
    return err
}
// 使用 result

// 其他语言风格
try {
    result = doSomething()
} catch (e) {
    // 处理异常
}
```

### 创建和使用错误

```go
import "errors"

func divide(a, b float64) (float64, error) {
    if b == 0 {
        return 0, errors.New("除数不能为零")
    }
    return a / b, nil
}

func main() {
    result, err := divide(10, 0)
    if err != nil {
        fmt.Println("错误:", err)  // 输出: 除数不能为零
        return
    }
    fmt.Println("结果:", result)
}
```

### 自定义错误类型

```go
import "fmt"

type ValidationError struct {
    Field   string
    Message string
}

func (e *ValidationError) Error() string {
    return fmt.Sprintf("%s: %s", e.Field, e.Message)
}

func validate(name string) error {
    if name == "" {
        return &ValidationError{
            Field:   "name",
            Message: "名字不能为空",
        }
    }
    return nil
}
```

---

## 常用标准库

### fmt - 格式化输出

```go
import "fmt"

func main() {
    name := "Alice"
    age := 25

    // 打印
    fmt.Println("Hello")           // 打印并换行
    fmt.Print("No newline")        // 不换行

    // 格式化打印
    fmt.Printf("Name: %s, Age: %d\n", name, age)

    // Sprintf（不打印，返回字符串）
    msg := fmt.Sprintf("Hello, %s!", name)
    fmt.Println(msg)
}
```

| 格式化符 | 说明 | 示例 |
|---------|------|------|
| `%s` | 字符串 | `"hello"` |
| `%d` | 整数 | `42` |
| `%f` | 浮点数 | `3.14` |
| `%t` | 布尔值 | `true` |
| `%v` | 自动选择合适格式 | 任意值 |
| `%+v` | 结构体显示字段名 | `{Name:Alice}` |

### time - 时间处理

```go
import (
    "fmt"
    "time"
)

func main() {
    now := time.Now()
    fmt.Println("当前时间:", now)

    // 格式化时间
    fmt.Println(now.Format("2006-01-02 15:04:05"))

    // 时间加减
    tomorrow := now.Add(24 * time.Hour)
    fmt.Println("明天:", tomorrow)

    // 定时器
    <-time.After(1 * time.Second)
    fmt.Println("1秒后...")
}
```

### strconv - 类型转换

```go
import (
    "fmt"
    "strconv"
)

func main() {
    // 字符串转整数
    n, _ := strconv.Atoi("42")
    fmt.Println(n + 1)  // 43

    // 整数转字符串
    s := strconv.Itoa(42)
    fmt.Println(s + "1")  // 421

    // 字符串转浮点数
    f, _ := strconv.ParseFloat("3.14", 64)
    fmt.Println(f * 2)  // 6.28

    // 浮点数转字符串
    s = strconv.FormatFloat(3.14, 'f', 2, 64)
    fmt.Println(s)  // 3.14
}
```

### json - JSON 处理

```go
import (
    "encoding/json"
    "fmt"
)

type Person struct {
    Name string `json:"name"`
    Age  int    `json:"age"`
}

func main() {
    // 结构体转 JSON
    p := Person{Name: "Alice", Age: 25}
    data, _ := json.Marshal(p)
    fmt.Println(string(data))  // {"name":"Alice","age":25}

    // JSON 转结构体
    jsonStr := `{"name":"Bob","age":30}`
    var p2 Person
    json.Unmarshal([]byte(jsonStr), &p2)
    fmt.Println(p2.Name, p2.Age)  // Bob 30
}
```

---

## 下一步

恭喜你完成了 Go 语言基础教程！

**推荐继续学习：**

1. **[项目教程](PROJECT_TUTORIAL.md)** - 学习如何用 Go 构建真实项目
2. **Go 官方文档** - https://go.dev/doc/
3. **Go 语言之旅** - https://tour.golang.org/

**实践建议：**

- 每天写一点代码
- 尝试修改教程中的例子
- 自己动手实现一些小功能
- 遇到问题多搜索、多提问
