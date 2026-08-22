#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/select.h>
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

    fd_set readfds;
    FD_ZERO(&readfds);
    FD_SET(pipes[0][0], &readfds);
    FD_SET(pipes[1][0], &readfds);

    int max_fd = pipes[0][0] > pipes[1][0] ? pipes[0][0] : pipes[1][0];
    struct timeval timeout = {.tv_sec = 1, .tv_usec = 0};
    int ready = select(max_fd + 1, &readfds, NULL, NULL, &timeout);
    if (ready == -1) {
        close_pipes(pipes);
        die("select");
    }
    if (ready == 0) {
        close_pipes(pipes);
        fprintf(stderr, "select timed out\n");
        return EXIT_FAILURE;
    }

    for (int i = 0; i < 2; i++) {
        if (FD_ISSET(pipes[i][0], &readfds)) {
            char buffer[64];
            ssize_t count = read(pipes[i][0], buffer, sizeof(buffer) - 1);
            if (count == -1) {
                close_pipes(pipes);
                die("read");
            }
            buffer[count] = '\0';
            printf("select ready=%d fd=%d payload=%s\n", ready, pipes[i][0], buffer);
        }
    }

    close_pipes(pipes);
    return EXIT_SUCCESS;
}
