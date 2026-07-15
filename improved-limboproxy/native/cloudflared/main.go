package main

/*
#include <stdlib.h>
*/
import "C"
import (
	"context"
	"encoding/json"
	"os"
	"sync"
	"unsafe"

	"github.com/cloudflare/cloudflared/cmd/cloudflared"
)

var (
	tunnelCancel context.CancelFunc
	mu           sync.Mutex
)

// StartCloudflared starts cloudflared tunnel in background.
// Payload: {"args":["tunnel","--no-autoupdate","run","--token","..."]}
// Returns 0 on success, 1 on parse error, 2 if already running.
//
//export StartCloudflared
func StartCloudflared(payload *C.char) C.int {
	var params struct {
		Args []string `json:"args"`
	}
	if err := json.Unmarshal([]byte(C.GoString(payload)), &params); err != nil {
		return 1
	}

	mu.Lock()
	if tunnelCancel != nil {
		mu.Unlock()
		return 2
	}

	ctx, cancel := context.WithCancel(context.Background())
	tunnelCancel = cancel
	mu.Unlock()

	go func() {
		oldArgs := os.Args
		os.Args = append([]string{"cloudflared"}, params.Args...)
		defer func() { os.Args = oldArgs }()

		app := cloudflared.NewApp()
		_ = app.RunContext(ctx, os.Args)
	}()

	return 0
}

// StopCloudflared stops the running tunnel.
//
//export StopCloudflared
func StopCloudflared() {
	mu.Lock()
	if tunnelCancel != nil {
		tunnelCancel()
		tunnelCancel = nil
	}
	mu.Unlock()
}

func main() {}
