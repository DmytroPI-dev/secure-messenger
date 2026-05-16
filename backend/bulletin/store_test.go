package bulletin

import (
	"path/filepath"
	"testing"
)

func newTestStore(t *testing.T) *Store {
	t.Helper()

	store, err := NewStore(filepath.Join(t.TempDir(), "bulletins.json"))
	if err != nil {
		t.Fatalf("NewStore() error = %v", err)
	}

	return store
}

func validEnvelope() Envelope {
	return Envelope{Version: 1, Nonce: "abc", Ciphertext: "cipher"}
}

func TestStoreAndReadOnceDeletesOnSuccess(t *testing.T) {
	store := newTestStore(t)

	if err := store.StoreNote("abc123", "def456", validEnvelope()); err != nil {
		t.Fatalf("StoreNote() error = %v", err)
	}

	envelope, ok, err := store.ReadOnce("abc123", "def456")
	if err != nil {
		t.Fatalf("ReadOnce() error = %v", err)
	}
	if !ok || envelope == nil || envelope.Ciphertext != "cipher" {
		t.Fatalf("ReadOnce() = %#v, %v, want returned envelope", envelope, ok)
	}

	envelope, ok, err = store.ReadOnce("abc123", "def456")
	if err != nil {
		t.Fatalf("ReadOnce() second call error = %v", err)
	}
	if ok || envelope != nil {
		t.Fatalf("ReadOnce() second call = %#v, %v, want nil, false", envelope, ok)
	}
}

func TestReadOnceDeletesAfterThreeFailedAttempts(t *testing.T) {
	store := newTestStore(t)

	if err := store.StoreNote("abc123", "def456", validEnvelope()); err != nil {
		t.Fatalf("StoreNote() error = %v", err)
	}

	for range 3 {
		envelope, ok, err := store.ReadOnce("abc123", "deadbeef")
		if err != nil {
			t.Fatalf("ReadOnce() error = %v", err)
		}
		if ok || envelope != nil {
			t.Fatalf("ReadOnce() = %#v, %v, want miss", envelope, ok)
		}
	}

	envelope, ok, err := store.ReadOnce("abc123", "def456")
	if err != nil {
		t.Fatalf("ReadOnce() after deletion error = %v", err)
	}
	if ok || envelope != nil {
		t.Fatalf("ReadOnce() after deletion = %#v, %v, want nil, false", envelope, ok)
	}
}
