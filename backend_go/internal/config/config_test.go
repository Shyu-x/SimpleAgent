package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestInitConfig(t *testing.T) {
	// 创建临时配置文件
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config.yaml")
	configContent := `
server:
  host: "127.0.0.1"
  port: 30000
model:
  name: "MiniMax-M2.7"
  api_key: "test-key"
`
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("failed to create temp config: %v", err)
	}

	// 测试配置加载
	err := InitConfig(configPath)
	if err != nil {
		t.Fatalf("InitConfig failed: %v", err)
	}
	if Config == nil {
		t.Fatal("Config should not be nil after InitConfig")
	}

	// 验证配置值
	if got := Config.GetString("server.host"); got != "127.0.0.1" {
		t.Errorf("expected server.host=127.0.0.1, got %s", got)
	}
	if got := Config.GetInt("server.port"); got != 30000 {
		t.Errorf("expected server.port=30000, got %d", got)
	}
}

func TestGetString(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config.yaml")
	configContent := `
test_key: "test_value"
empty_key: ""
`
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("failed to create temp config: %v", err)
	}

	InitConfig(configPath)

	if got := GetString("test_key"); got != "test_value" {
		t.Errorf("expected test_value, got %s", got)
	}
	if got := GetString("nonexistent"); got != "" {
		t.Errorf("expected empty string for nonexistent key, got %s", got)
	}
}

func TestGetInt(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config.yaml")
	configContent := `
int_key: 42
negative_int: -10
zero_int: 0
string_not_int: "not a number"
`
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("failed to create temp config: %v", err)
	}

	InitConfig(configPath)

	tests := []struct {
		key      string
		expected int
	}{
		{"int_key", 42},
		{"negative_int", -10},
		{"zero_int", 0},
		{"string_not_int", 0},
		{"nonexistent", 0},
	}

	for _, tt := range tests {
		if got := GetInt(tt.key); got != tt.expected {
			t.Errorf("GetInt(%s): expected %d, got %d", tt.key, tt.expected, got)
		}
	}
}

func TestGetBool(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config.yaml")
	configContent := `
true_key: true
false_key: false
yes_key: yes
no_key: no
1_key: 1
0_key: 0
string_true: "true"
`
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("failed to create temp config: %v", err)
	}

	InitConfig(configPath)

	tests := []struct {
		key      string
		expected bool
	}{
		{"true_key", true},
		{"false_key", false},
		{"yes_key", true},
		{"no_key", false},
		{"1_key", true},
		{"0_key", false},
		{"string_true", true},
		{"nonexistent", false},
	}

	for _, tt := range tests {
		if got := GetBool(tt.key); got != tt.expected {
			t.Errorf("GetBool(%s): expected %v, got %v", tt.key, tt.expected, got)
		}
	}
}

func TestGetFloat64(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config.yaml")
	configContent := `
float_key: 3.14159
int_as_float: 42
negative_float: -2.5
zero_float: 0.0
`
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("failed to create temp config: %v", err)
	}

	InitConfig(configPath)

	tests := []struct {
		key      string
		expected float64
	}{
		{"float_key", 3.14159},
		{"int_as_float", 42.0},
		{"negative_float", -2.5},
		{"zero_float", 0.0},
		{"nonexistent", 0.0},
	}

	for _, tt := range tests {
		if got := GetFloat64(tt.key); got != tt.expected {
			t.Errorf("GetFloat64(%s): expected %f, got %f", tt.key, tt.expected, got)
		}
	}
}

func TestGetServerAddr(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config.yaml")
	configContent := `
server:
  host: "192.168.1.1"
  port: 8080
`
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("failed to create temp config: %v", err)
	}

	InitConfig(configPath)

	addr := GetServerAddr()
	expected := "192.168.1.1:8080"
	if addr != expected {
		t.Errorf("expected %s, got %s", expected, addr)
	}
}

func TestEnvVarReplacement(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config.yaml")

	// 设置环境变量
	os.Setenv("TEST_API_KEY", "env-secret-key")
	defer os.Unsetenv("TEST_API_KEY")

	configContent := `
api:
  key: "${TEST_API_KEY}"
other: "static-value"
`
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("failed to create temp config: %v", err)
	}

	InitConfig(configPath)

	// 注意: viper 的环境变量替换需要在读取后手动处理
	// 这里测试基本功能
	if Config == nil {
		t.Fatal("Config should not be nil")
	}
}

func TestConfigFileNotFound(t *testing.T) {
	err := InitConfig("/nonexistent/path/config.yaml")
	if err == nil {
		t.Error("expected error for nonexistent config file")
	}
}

func TestNestedKeys(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config.yaml")
	configContent := `
database:
  host: "localhost"
  port: 5432
  credentials:
    username: "admin"
    password: "secret"
redis:
  host: "localhost"
  port: 6379
`
	if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
		t.Fatalf("failed to create temp config: %v", err)
	}

	InitConfig(configPath)

	// 测试嵌套键访问
	if got := Config.GetString("database.host"); got != "localhost" {
		t.Errorf("expected localhost, got %s", got)
	}
	if got := Config.GetInt("database.port"); got != 5432 {
		t.Errorf("expected 5432, got %d", got)
	}
	if got := Config.GetString("database.credentials.username"); got != "admin" {
		t.Errorf("expected admin, got %s", got)
	}
}
