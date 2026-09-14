// Go 1.27 crypto/mldsa（FIPS 204 后量子签名）：签验闭环、篡改与错钥拒绝、尺寸。
// 构建：GOTOOLCHAIN=go1.27.1 go test ./ -v（独立 go.mod）
package mldsa

import (
	"bytes"
	"crypto/mldsa"
	"crypto/rand"
	"testing"
)

func TestRoundTrip(t *testing.T) {
	sk, err := mldsa.GenerateKey(mldsa.MLDSA65())
	if err != nil {
		t.Fatal(err)
	}
	msg := []byte("order A-42 paid")
	sig, err := sk.Sign(rand.Reader, msg, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := mldsa.Verify(sk.PublicKey(), msg, sig, nil); err != nil {
		t.Fatalf("验签失败: %v", err)
	}
	t.Logf("ML-DSA-65: 公钥 %dB 签名 %dB", mldsa.MLDSA65().PublicKeySize(), mldsa.MLDSA65().SignatureSize())
}

func TestTamperedRejected(t *testing.T) {
	sk, _ := mldsa.GenerateKey(mldsa.MLDSA65())
	sig, _ := sk.Sign(rand.Reader, []byte("order A-42 paid"), nil)
	if err := mldsa.Verify(sk.PublicKey(), []byte("order A-42 PAID"), sig, nil); err == nil {
		t.Fatal("篡改后应拒绝")
	}
}

func TestWrongKeyRejected(t *testing.T) {
	sk, _ := mldsa.GenerateKey(mldsa.MLDSA65())
	other, _ := mldsa.GenerateKey(mldsa.MLDSA65())
	sig, _ := sk.Sign(rand.Reader, []byte("m"), nil)
	if err := mldsa.Verify(other.PublicKey(), []byte("m"), sig, nil); err == nil {
		t.Fatal("错钥应拒绝")
	}
}

func TestDeterministicStable(t *testing.T) {
	sk, _ := mldsa.GenerateKey(mldsa.MLDSA44())
	a, err1 := sk.SignDeterministic([]byte("m"), nil)
	b, err2 := sk.SignDeterministic([]byte("m"), nil)
	if err1 != nil || err2 != nil || !bytes.Equal(a, b) {
		t.Fatalf("确定性签名应稳定: %v %v", err1, err2)
	}
}
