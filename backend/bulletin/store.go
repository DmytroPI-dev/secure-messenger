package bulletin

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	MaxAttempts       = 3
	defaultNoteTTL    = 72 * time.Hour
	cleanupInterval   = 1 * time.Hour
	defaultFileName   = "bulletins.json"
	defaultFolderName = "messenger-backend"
	maxFieldLength    = 4096
)

type Envelope struct {
	Version    int    `json:"version"`
	Nonce      string `json:"nonce"`
	Ciphertext string `json:"ciphertext"`
}

type Record struct {
	MailboxID          string    `json:"mailboxId"`
	AccessVerifier     string    `json:"accessVerifier"`
	FailedAttempts     int       `json:"failedAttempts"`
	CiphertextEnvelope Envelope  `json:"ciphertextEnvelope"`
	CreatedAt          time.Time `json:"createdAt"`
	ExpiresAt          time.Time `json:"expiresAt"`
}

type fileState struct {
	Records map[string]Record `json:"records"`
}

type Store struct {
	path    string
	mu      sync.Mutex
	records map[string]Record
}

func DefaultStorePath() string {
	if configuredPath := strings.TrimSpace(os.Getenv("BULLETIN_STORE_PATH")); configuredPath != "" {
		return configuredPath
	}

	configDir, err := os.UserConfigDir()
	if err == nil && configDir != "" {
		return filepath.Join(configDir, defaultFolderName, defaultFileName)
	}

	return filepath.Join(os.TempDir(), defaultFolderName, defaultFileName)
}

func noteTTL() time.Duration {
	rawMinutes := strings.TrimSpace(os.Getenv("BULLETIN_TTL_MINUTES"))
	if rawMinutes == "" {
		return defaultNoteTTL
	}

	minutes, err := strconv.Atoi(rawMinutes)
	if err != nil || minutes <= 0 {
		return defaultNoteTTL
	}

	return time.Duration(minutes) * time.Minute
}

func NewStore(path string) (*Store, error) {
	if strings.TrimSpace(path) == "" {
		return nil, errors.New("bulletin store path is required")
	}

	store := &Store{
		path:    path,
		records: map[string]Record{},
	}

	if err := store.load(); err != nil {
		return nil, err
	}

	return store, nil
}

func (s *Store) load() error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o700); err != nil {
		return err
	}

	payload, err := os.ReadFile(s.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}

	if len(payload) == 0 {
		return nil
	}

	var state fileState
	if err := json.Unmarshal(payload, &state); err != nil {
		return err
	}

	if state.Records == nil {
		state.Records = map[string]Record{}
	}

	s.records = state.Records
	return nil
}

func (s *Store) writeLocked() error {
	state := fileState{Records: s.records}
	payload, err := json.Marshal(state)
	if err != nil {
		return err
	}

	tempPath := s.path + ".tmp"
	if err := os.WriteFile(tempPath, payload, 0o600); err != nil {
		return err
	}

	return os.Rename(tempPath, s.path)
}

func validateIdentifier(value string) bool {
	if value == "" || len(value) > 128 {
		return false
	}

	for _, char := range value {
		switch {
		case char >= 'a' && char <= 'f':
		case char >= '0' && char <= '9':
		default:
			return false
		}
	}

	return true
}

func validateEnvelope(envelope Envelope) bool {
	if envelope.Version != 1 {
		return false
	}

	if envelope.Nonce == "" || envelope.Ciphertext == "" {
		return false
	}

	if len(envelope.Nonce) > maxFieldLength || len(envelope.Ciphertext) > maxFieldLength {
		return false
	}

	return true
}

func (s *Store) deleteIfExpiredLocked(mailboxID string, now time.Time) bool {
	record, exists := s.records[mailboxID]
	if !exists {
		return false
	}

	if now.Before(record.ExpiresAt) {
		return false
	}

	delete(s.records, mailboxID)
	return true
}

func (s *Store) StoreNote(mailboxID string, accessVerifier string, envelope Envelope) error {
	if !validateIdentifier(mailboxID) || !validateIdentifier(accessVerifier) || !validateEnvelope(envelope) {
		return errors.New("invalid bulletin payload")
	}

	now := time.Now().UTC()

	s.mu.Lock()
	defer s.mu.Unlock()

	s.records[mailboxID] = Record{
		MailboxID:          mailboxID,
		AccessVerifier:     accessVerifier,
		FailedAttempts:     0,
		CiphertextEnvelope: envelope,
		CreatedAt:          now,
		ExpiresAt:          now.Add(noteTTL()),
	}

	return s.writeLocked()
}

func (s *Store) ReadOnce(mailboxID string, accessVerifier string) (*Envelope, bool, error) {
	if !validateIdentifier(mailboxID) || !validateIdentifier(accessVerifier) {
		return nil, false, nil
	}

	now := time.Now().UTC()

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.deleteIfExpiredLocked(mailboxID, now) {
		if err := s.writeLocked(); err != nil {
			return nil, false, err
		}
		return nil, false, nil
	}

	record, exists := s.records[mailboxID]
	if !exists {
		return nil, false, nil
	}

	if record.AccessVerifier != accessVerifier {
		record.FailedAttempts += 1
		if record.FailedAttempts >= MaxAttempts {
			delete(s.records, mailboxID)
		} else {
			s.records[mailboxID] = record
		}

		if err := s.writeLocked(); err != nil {
			return nil, false, err
		}

		return nil, false, nil
	}

	envelope := record.CiphertextEnvelope
	delete(s.records, mailboxID)
	if err := s.writeLocked(); err != nil {
		return nil, false, err
	}

	return &envelope, true, nil
}

func (s *Store) CleanupExpired() {
	ticker := time.NewTicker(cleanupInterval)
	defer ticker.Stop()

	for range ticker.C {
		now := time.Now().UTC()

		s.mu.Lock()
		changed := false
		for mailboxID := range s.records {
			if s.deleteIfExpiredLocked(mailboxID, now) {
				changed = true
			}
		}

		if changed {
			_ = s.writeLocked()
		}
		s.mu.Unlock()
	}
}
