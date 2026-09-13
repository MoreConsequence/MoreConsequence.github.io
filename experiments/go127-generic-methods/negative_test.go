// 负编译证明：两个禁区必须编译失败，且报错指向接口语义。
// 运行：GOTOOLCHAIN=go1.27.1 go test ./ -run TestGenericMethodBoundaries -v
package methods

import (
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func expectBuildFail(t *testing.T, dir string, wantSubstr []string) {
	t.Helper()
	cmd := exec.Command("go", "build", "./...")
	cmd.Dir = filepath.Join("testdata", dir)
	out, err := cmd.CombinedOutput()
	if err == nil {
		t.Fatalf("%s 预期编译失败，实际通过", dir)
	}
	for _, s := range wantSubstr {
		if !strings.Contains(string(out), s) {
			t.Fatalf("%s 报错缺关键串 %q，全文:\n%s", dir, s, out)
		}
	}
	t.Logf("%s 被拒，关键串命中: %q", dir, wantSubstr[0])
}

func TestGenericMethodBoundaries(t *testing.T) {
	if !strings.HasPrefix(runtime.Version(), "go1.27") {
		t.Skipf("需 go1.27 工具链，当前 %s", runtime.Version())
	}
	// 禁区 1：接口方法不能带类型参数。
	expectBuildFail(t, "ifacegeneric", []string{"interface", "type parameter"})
	// 禁区 2：泛型方法不能满足接口。
	expectBuildFail(t, "nosatisfy", []string{"does not implement"})
}
