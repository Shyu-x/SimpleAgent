# Go语言进阶 - 协程与通道

## 核心问题
Go 如何处理并发？为什么比线程更高效？

## 传统并发模型的问题

### 线程的代价
```javascript
// Node.js：单线程 + 事件循环
// 优点：无需锁、I/O 高效
// 缺点：CPU 密集型任务受限

// Java/Go：多线程
// 优点：真正并行
// 缺点：创建成本高（1-2MB 栈）、切换慢
```

### Go 的解决方案：Goroutine
```go
// 创建一个协程（非常轻量）
go func() {
    // 并发执行
    fmt.Println("Hello from goroutine")
}()

// 主协程继续执行
fmt.Println("Hello from main")

// 等待一下，让协程有机会执行
time.Sleep(time.Second)
```

## Goroutine 特性

### 1. 极轻量
- 初始栈大小：2KB（线程 1-2MB）
- 由 Go 运行时管理
- 可以创建数十万个

### 2. 自动调度
```go
// Go 运行时有一个调度器 (GMP 模型)
// G: Goroutine
// M: Machine (线程)
// P: Processor (处理器)

func main() {
    // 创建协程
    for i := 0; i < 10000; i++ {
        go func(id int) {
            fmt.Println("Goroutine", id)
        }(i)
    }

    // 主协程睡眠等待其他协程完成
    time.Sleep(time.Second)
}
```

### 3. 通信方式：Channel
```go
// 创建通道
ch := make(chan string)

// 发送数据（阻塞）
go func() {
    ch <- "result"  // 发送
}()

// 接收数据（阻塞）
result := <-ch  // 接收
fmt.Println(result)
```

## Channel 详解

### 1. 有缓冲通道
```go
// 缓冲大小为 3
ch := make(chan int, 3)

// 发送 3 个数据不会阻塞
ch <- 1
ch <- 2
ch <- 3

// 第 4 个才会阻塞
```

### 2. 方向性通道（函数参数）
```go
// 只发送
func producer(ch chan<- int) {
    ch <- 42
}

// 只接收
func consumer(ch <-chan int) {
    value := <-ch
    fmt.Println(value)
}
```

### 3. Select（多路复用）
```go
select {
case msg1 := <-ch1:
    fmt.Println("Received", msg1)
case msg2 := <-ch2:
    fmt.Println("Received", msg2)
case <-time.After(time.Second):
    fmt.Println("Timeout")
default:
    fmt.Println("No message")
}
```

## 实际应用示例

### 并发请求
```go
func fetchUrls(urls []string) []string {
    results := make(chan string, len(urls))
    var wg sync.WaitGroup

    for _, url := range urls {
        wg.Add(1)
        go func(u string) {
            defer wg.Done()
            resp, _ := http.Get(u)
            body, _ := io.ReadAll(resp.Body)
            results <- string(body)
        }(url)
    }

    // 等待所有协程完成
    go func() {
        wg.Wait()
        close(results)
    }()

    // 收集结果
    var responses []string
    for r := range results {
        responses = append(responses, r)
    }

    return responses
}
```

### 并发控制
```go
// 限制并发数为 5
semaphore := make(chan struct{}, 5)

for _, task := range tasks {
    semaphore <- struct{}{}  // 获取信号量
    go func(t Task) {
        defer func() { <-semaphore }()  // 释放
        process(t)
    }(task)
}
```

## 竞态检测
```bash
# 运行竞态检测器
go run -race main.go

# 测试时检测
go test -race ./...
```

## 新手常见问题

Q: 协程和线程的区别？
A: 线程是 OS 级，由内核调度；协程是用户态，由 Go 运行时调度。协程更轻量，创建成本低

Q: 通道什么时候阻塞？
A: 发送到无缓冲通道阻塞直到有人接收；接收阻塞直到有人发送

Q: 如何避免通道泄漏？
A: 确保每个通道都会被关闭，或使用 `context` 取消

Q: 为什么打印没执行？
A: 主协程结束了，子协程还没机会执行。用 `sync.WaitGroup` 或通道同步

## 延伸学习
- [B2-Gin中间件.md](B2-Gin中间件.md) - HTTP 框架
- [B3-DDD架构设计.md](B3-DDD架构设计.md) - 架构模式
