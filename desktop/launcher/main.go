package main

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

const version = "24.19.0"

var releases = map[string]struct{ file, hash string }{
	"windows/amd64": {"node-v24.19.0-win-x64.zip", "57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73"},
	"linux/amd64":   {"node-v24.19.0-linux-x64.tar.gz", "f625d97cd707df4ff96254916fbc5ff014f09c09effe5a1e0ca8f6d41a8789d4"},
}

func installNode(root string) (string, error) {
	release, ok := releases[runtime.GOOS+"/"+runtime.GOARCH]
	if !ok {
		return "", errors.New("unsupported desktop platform")
	}
	cache := filepath.Join(root, ".runtime")
	if err := os.MkdirAll(cache, 0700); err != nil {
		return "", err
	}
	name := "node-v" + version
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	node := filepath.Join(cache, name)
	if b, err := os.ReadFile(node); err == nil {
		sum := sha256.Sum256(b)
		expected, err := os.ReadFile(node + ".sha256")
		if err == nil && strings.TrimSpace(string(expected)) == hex.EncodeToString(sum[:]) {
			return node, nil
		}
	}
	fmt.Println("Downloading the free application runtime (first launch only)...")
	client := http.Client{Timeout: 3 * time.Minute, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if req.URL.Scheme != "https" || req.URL.Hostname() != "nodejs.org" || len(via) > 3 {
			return errors.New("unexpected runtime download redirect")
		}
		return nil
	}}
	response, err := client.Get("https://nodejs.org/dist/v" + version + "/" + release.file)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		return "", fmt.Errorf("runtime download returned HTTP %d", response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, 100*1024*1024+1))
	if err != nil {
		return "", err
	}
	if len(body) > 100*1024*1024 {
		return "", errors.New("runtime archive exceeds size limit")
	}
	sum := sha256.Sum256(body)
	if hex.EncodeToString(sum[:]) != release.hash {
		return "", errors.New("runtime checksum failed; the downloaded file will not run")
	}
	archive := filepath.Join(cache, release.file)
	if err = os.WriteFile(archive, body, 0600); err != nil {
		return "", err
	}
	defer os.Remove(archive)
	var binary []byte
	if strings.HasSuffix(release.file, ".zip") {
		z, err := zip.OpenReader(archive)
		if err != nil {
			return "", err
		}
		defer z.Close()
		expected := strings.TrimSuffix(release.file, ".zip") + "/node.exe"
		for _, f := range z.File {
			if f.Name == expected {
				r, err := f.Open()
				if err != nil {
					return "", err
				}
				binary, err = io.ReadAll(io.LimitReader(r, 256*1024*1024))
				r.Close()
				if err != nil {
					return "", err
				}
				break
			}
		}
	} else {
		f, err := os.Open(archive)
		if err != nil {
			return "", err
		}
		defer f.Close()
		g, err := gzip.NewReader(f)
		if err != nil {
			return "", err
		}
		defer g.Close()
		t := tar.NewReader(g)
		expected := strings.TrimSuffix(release.file, ".tar.gz") + "/bin/node"
		for {
			h, err := t.Next()
			if err == io.EOF {
				break
			}
			if err != nil {
				return "", err
			}
			if h.Name == expected && h.Typeflag == tar.TypeReg {
				binary, err = io.ReadAll(io.LimitReader(t, 256*1024*1024))
				if err != nil {
					return "", err
				}
				break
			}
		}
	}
	if len(binary) == 0 {
		return "", errors.New("official archive did not contain the expected runtime")
	}
	temp := node + ".tmp"
	if err = os.WriteFile(temp, binary, 0700); err != nil {
		return "", err
	}
	if err = os.Rename(temp, node); err != nil {
		return "", err
	}
	sum = sha256.Sum256(binary)
	if err = os.WriteFile(node+".sha256", []byte(hex.EncodeToString(sum[:])), 0600); err != nil {
		return "", err
	}
	return node, nil
}

func run() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	root := filepath.Dir(exe)
	if _, err = os.Stat(filepath.Join(root, "dist", "index.html")); err != nil {
		return errors.New("extract the entire downloaded ZIP first, then open Start Wine")
	}
	node, err := installNode(root)
	if err != nil {
		return err
	}
	port := "5180"
	if value := os.Getenv("WINE_DESKTOP_PORT"); value != "" {
		n, err := strconv.Atoi(value)
		if err != nil || n < 1024 || n > 65535 {
			return errors.New("invalid application port")
		}
		port = value
	}
	listener, err := net.Listen("tcp", "127.0.0.1:"+port)
	if err != nil {
		return fmt.Errorf("the wine app may already be open; close its earlier window before starting another copy (%w)", err)
	}
	listener.Close()
	data := filepath.Join(root, "data")
	if err = os.MkdirAll(data, 0700); err != nil {
		return err
	}
	cmd := exec.Command(node, "server/index.js")
	cmd.Dir = root
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	overrides := map[string]string{"WINE_API_HOST": "127.0.0.1", "WINE_API_PORT": port, "WINE_DB_FILE": filepath.Join(data, "wine-engine.sqlite"), "ENGINE_ACCESS_TOKEN": "", "WINE_ALLOWED_ORIGINS": "", "WINE_ENABLE_PAID_SEARCH": "false"}
	for _, value := range os.Environ() {
		key := strings.SplitN(value, "=", 2)[0]
		if _, ok := overrides[key]; !ok {
			cmd.Env = append(cmd.Env, value)
		}
	}
	for k, v := range overrides {
		cmd.Env = append(cmd.Env, k+"="+v)
	}
	if err = cmd.Start(); err != nil {
		return err
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	client := http.Client{Timeout: time.Second}
	address := "http://127.0.0.1:" + port
	ready := false
	for i := 0; i < 100; i++ {
		select {
		case err := <-done:
			return fmt.Errorf("wine service stopped during startup: %v", err)
		default:
		}
		r, e := client.Get(address + "/api/health")
		if e == nil {
			var health struct {
				OK         bool `json:"ok"`
				Persistent bool `json:"persistent"`
			}
			json.NewDecoder(r.Body).Decode(&health)
			r.Body.Close()
			if r.StatusCode == 200 && health.OK && health.Persistent {
				ready = true
				break
			}
		}
		time.Sleep(200 * time.Millisecond)
	}
	if !ready {
		cmd.Process.Kill()
		<-done
		return errors.New("wine service did not become ready")
	}
	fmt.Println("Ready. Your wine app is opening in your browser.")
	fmt.Println("Upload your Excel file there. Verified prices arrive as background searches finish.")
	fmt.Println("Keep this window open while researching prices. Your inventory and history are saved in the data folder.")
	if os.Getenv("WINE_DESKTOP_NO_BROWSER") == "" {
		var browser *exec.Cmd
		if runtime.GOOS == "windows" {
			browser = exec.Command("cmd.exe", "/c", "start", "", address)
		} else {
			browser = exec.Command("xdg-open", address)
		}
		if err = browser.Start(); err != nil {
			fmt.Println("Open your browser to", address)
		} else {
			go browser.Wait()
		}
	}
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt)
	defer signal.Stop(signals)
	select {
	case err = <-done:
		return err
	case <-signals:
		if e := cmd.Process.Signal(os.Interrupt); e != nil {
			cmd.Process.Kill()
		}
		select {
		case <-done:
		case <-time.After(5 * time.Second):
			cmd.Process.Kill()
			<-done
		}
		return nil
	}
}

func main() {
	fmt.Println("Wine Purchasing Intelligence — free desktop pricing")
	if err := run(); err != nil {
		fmt.Println("Could not start:", err)
		fmt.Println("Press Enter to close this window.")
		fmt.Scanln()
		os.Exit(1)
	}
}
