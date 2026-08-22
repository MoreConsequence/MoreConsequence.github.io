# select / poll / epoll 最小 readiness 实验证据

本目录记录文章 `select-poll-epoll-deep-dive` 对应的最小可运行检查，日期为 2026-08-22。

实验只做一件事：创建两条 pipe，只向第二条 pipe 写入数据，然后分别用 `select`、`poll`、`epoll` 等待读端，确认返回的 ready 集合只包含第二条 pipe。它证明的是三个 API 的共同 readiness 契约，不是网络吞吐、系统调用延迟、CPU 占用、LT/ET 性能或生产服务容量。

## 命令

macOS 上运行 POSIX 版本：

```bash
cc -std=c11 -Wall -Wextra -Wpedantic experiments/select-poll-epoll/select_demo.c -o /tmp/select_demo
/tmp/select_demo
cc -std=c11 -Wall -Wextra -Wpedantic experiments/select-poll-epoll/poll_demo.c -o /tmp/poll_demo
/tmp/poll_demo
```

Linux 容器中运行三份版本：

```bash
docker run --rm \
  -v /Users/lianghaoyu/codes/github-blog/experiments/select-poll-epoll:/src \
  -w /src gcc:14 sh -c '
    set -eu
    cc -std=c11 -Wall -Wextra -Wpedantic select_demo.c -o /tmp/select_demo
    cc -std=c11 -Wall -Wextra -Wpedantic poll_demo.c -o /tmp/poll_demo
    cc -std=c11 -Wall -Wextra -Wpedantic epoll_demo.c -o /tmp/epoll_demo
    /tmp/select_demo
    /tmp/poll_demo
    /tmp/epoll_demo
  '
```

复杂度计数模型：

```bash
python3 experiments/epoll-readiness-model/sim.py \
  --connections 100,10000 --ready 10 --wait-calls 1000
```

模型输出只支持“全量扫描检查数随注册连接数增长，而 ready 事件处理数固定”的方向性判断；不能改写成 epoll 的吞吐或延迟 benchmark。
