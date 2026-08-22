# select / poll / epoll 最小就绪实验

三个程序都创建两条 pipe，只往第二条 pipe 写入数据，然后等待两条读端。它们应该都只报告第二条读端 ready。

这个实验验证的是 API 的共同契约：**等待返回的是“哪个 fd 现在可以做一次不会阻塞的读”**。它不测网络吞吐、系统调用延迟、内核扫描实现或 `epoll` 的 LT/ET 性能。

## macOS / POSIX

```bash
cc -std=c11 -Wall -Wextra -Wpedantic select_demo.c -o select_demo
cc -std=c11 -Wall -Wextra -Wpedantic poll_demo.c -o poll_demo

./select_demo
./poll_demo
```

## Linux

```bash
cc -std=c11 -Wall -Wextra -Wpedantic select_demo.c -o select_demo
cc -std=c11 -Wall -Wextra -Wpedantic poll_demo.c -o poll_demo
cc -std=c11 -Wall -Wextra -Wpedantic epoll_demo.c -o epoll_demo

./select_demo
./poll_demo
./epoll_demo
```

`epoll_demo.c` 只使用 Linux 的 `<sys/epoll.h>`，因此在 macOS 上不会编译。文章中的 TCP 事件循环还要额外处理非阻塞、短读、短写、EOF、错误和输出缓冲区；这里保持实验最小，方便逐行对照三个等待 API。

## Go netpoll 观测

Go 版本使用真实 TCP socket：服务端为每条连接启动一个 goroutine，让它们同时停在 `io.ReadFull`，客户端再一次性写入 1 字节。它验证的是“Go API 看起来阻塞，但等待可以落在 G 层”的路径；`runtime.NumGoroutine` 和耗时输出不是线程数 benchmark，也不能单独证明使用了哪一个内核后端。

```bash
go run go_netpoll_demo.go -n 32 -settle 100ms
```

预期会看到两行：第一行是所有连接已进入 parked 阶段，第二行是所有连接成功读写。具体 goroutine 数量和微秒/毫秒耗时取决于 Go 版本、操作系统和机器调度。
