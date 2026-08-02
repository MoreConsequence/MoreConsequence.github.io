// 对比"传统 read+write 循环"与"sendfile"发送同一文件的耗时。
// 数据会因机器而异——这正是留给你自己跑的原因。
//
// 运行(在实验目录):go run ./zero-copy <任意文件路径>
// 例:go run ./zero-copy /usr/bin/go
package main

import (
	"fmt"
	"io"
	"net"
	"os"
	"syscall"
	"time"
)

// 用 read+write 循环把文件发进一个丢弃数据的 socket 对端
func viaReadWrite(f *os.File, conn net.Conn) (time.Duration, error) {
	buf := make([]byte, 64*1024)
	start := time.Now()
	for {
		n, err := f.Read(buf)
		if n > 0 {
			if _, werr := conn.Write(buf[:n]); werr != nil {
				return 0, werr
			}
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			return 0, err
		}
	}
	return time.Since(start), nil
}

func viaSendfile(f *os.File, conn net.Conn) (time.Duration, error) {
	tcp := conn.(*net.TCPConn)
	tcpf, err := tcp.File()
	if err != nil {
		return 0, err
	}
	defer tcpf.Close()

	var off int64
	start := time.Now()
	for {
		before := off
		n, serr := syscall.Sendfile(int(tcpf.Fd()), int(f.Fd()), &off, 1<<20)
		if n > 0 {
			// 平台差异:Linux 由内核推进 offset;macOS 不推进,需手动前进。
			if off == before {
				off += int64(n)
			}
		}
		if n <= 0 || serr == io.EOF {
			break
		}
		if serr != nil {
			return 0, serr
		}
	}
	return time.Since(start), nil
}

func main() {
	if len(os.Args) < 2 {
		fmt.Println("用法: go run ./zero-copy <文件路径>")
		os.Exit(1)
	}

	// 建一个"丢弃"对端:数据进来就扔掉
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		panic(err)
	}
	go func() {
		c, _ := ln.Accept()
		defer c.Close()
		io.Copy(io.Discard, c)
	}()

	conn, err := net.Dial("tcp", ln.Addr().String())
	if err != nil {
		panic(err)
	}

	info, err := os.Stat(os.Args[1])
	if err != nil {
		panic(err)
	}

	f, err := os.Open(os.Args[1])
	if err != nil {
		panic(err)
	}
	d1, err := viaReadWrite(f, conn)
	f.Close()
	fmt.Printf("文件: %s(%d MB) 已预热页缓存\n", os.Args[1], info.Size()>>20)

	f, err = os.Open(os.Args[1])
	if err != nil {
		panic(err)
	}
	d2, err := viaReadWrite(f, conn)
	f.Close()
	fmt.Printf("read+write : %v\n", d1)
	fmt.Printf("read+write(第二次): %v\n", d2)

	f, err = os.Open(os.Args[1])
	if err != nil {
		panic(err)
	}
	d3, err := viaSendfile(f, conn)
	f.Close()
	fmt.Printf("sendfile   : %v\n", d3)

	fmt.Println("----")
	fmt.Println("不同机器差异很大,请在你自己的机器上重复 3 次取中位数。")
}
