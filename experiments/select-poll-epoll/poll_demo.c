#include <errno.h>
#include <poll.h>
#include <stdio.h>
#include <stdlib.h>
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

    const char payload[] = "pipe-1-ready";
    if (write(pipes[1][1], payload, sizeof(payload)) == -1) {
        close_pipes(pipes);
        die("write");
    }

    struct pollfd fds[2] = {
        {.fd = pipes[0][0], .events = POLLIN, .revents = 0},
        {.fd = pipes[1][0], .events = POLLIN, .revents = 0},
    };
    int ready = poll(fds, 2, 1000);
    if (ready == -1) {
        close_pipes(pipes);
        die("poll");
    }
    if (ready == 0) {
        close_pipes(pipes);
        fprintf(stderr, "poll timed out\n");
        return EXIT_FAILURE;
    }

    for (int i = 0; i < 2; i++) {
        if ((fds[i].revents & POLLIN) != 0) {
            char buffer[64];
            ssize_t count = read(fds[i].fd, buffer, sizeof(buffer) - 1);
            if (count == -1) {
                close_pipes(pipes);
                die("read");
            }
            buffer[count] = '\0';
            printf("poll ready=%d fd=%d payload=%s\n", ready, fds[i].fd, buffer);
        }
    }

    close_pipes(pipes);
    return EXIT_SUCCESS;
}
