package main

import (
	"bytes"
	"fmt"
	"io"
)

func main() {
	var buf *bytes.Buffer
	var value any = buf
	fmt.Printf("any_typed_nil=%t\n", value == nil)

	var reader io.Reader = (*bytes.Reader)(nil)
	fmt.Printf("reader_typed_nil=%t\n", reader == nil)
}
