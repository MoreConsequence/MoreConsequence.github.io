#define _GNU_SOURCE

#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/epoll.h>
#include <unistd.h>

static void die(const char *message) {
    perror(message);
    exit(EXIT_FAILURE);
}

static void close_pipes(int pipes[2][2]) {
    for (int i = 0; i < 2; i++) {
        close(pipes[i][0]);
        close(pipes[i][1]);
    }
}

int main(void) {
    int pipes[2][2];
    for (int i = 0; i < 2; i++) {
        if (pipe(pipes[i]) == -1) {
            die("pipe");
        }
    }

    int epoll_fd = epoll_create1(EPOLL_CLOEXEC);
    if (epoll_fd == -1) {
        close_pipes(pipes);
        die("epoll_create1");
    }

    for (int i = 0; i < 2; i++) {
        struct epoll_event event = {
            .events = EPOLLIN,
            .data.fd = pipes[i][0],
        };
        if (epoll_ctl(epoll_fd, EPOLL_CTL_ADD, pipes[i][0], &event) == -1) {
            close(epoll_fd);
            close_pipes(pipes);
            die("epoll_ctl");
        }
    }

    const char payload[] = "pipe-1-ready";
    if (write(pipes[1][1], payload, sizeof(payload)) == -1) {
        close(epoll_fd);
        close_pipes(pipes);
        die("write");
    }

    struct epoll_event events[2];
    int ready = epoll_wait(epoll_fd, events, 2, 1000);
    if (ready == -1) {
        close(epoll_fd);
        close_pipes(pipes);
        die("epoll_wait");
    }
    if (ready == 0) {
        close(epoll_fd);
        close_pipes(pipes);
        fprintf(stderr, "epoll_wait timed out\n");
        return EXIT_FAILURE;
    }

    for (int i = 0; i < ready; i++) {
        if ((events[i].events & EPOLLIN) != 0) {
            char buffer[64];
            ssize_t count = read(events[i].data.fd, buffer, sizeof(buffer) - 1);
            if (count == -1) {
                close(epoll_fd);
                close_pipes(pipes);
                die("read");
            }
            buffer[count] = '\0';
            printf("epoll ready=%d fd=%d payload=%s\n", ready,
                   events[i].data.fd, buffer);
        }
    }

    close(epoll_fd);
    close_pipes(pipes);
    return EXIT_SUCCESS;
}
