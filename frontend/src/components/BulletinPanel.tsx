import { Box, Button, HStack, IconButton, Input, Spinner, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";
import { MdChatBubbleOutline, MdForum, MdVisibility, MdVisibilityOff } from "react-icons/md";
import { useTranslation } from "react-i18next";
import {
  decryptBulletinPayload,
  encryptBulletinPayload,
  getMaxBulletinTextLength,
  prepareBulletinLookup,
  type BulletinPayload,
} from "@/utils/bulletin";
import { ToggleTip } from "@/components/ui/toggle-tip";

type StoreState = "idle" | "success" | "invalid" | "error";
type ReadState = "idle" | "blocked" | "miss" | "success" | "error";

export function BulletinPanel() {
  const { t } = useTranslation();
  const [storeCode, setStoreCode] = useState("");
  const [readCode, setReadCode] = useState("");
  const [storeText, setStoreText] = useState("");
  const [storeState, setStoreState] = useState<StoreState>("idle");
  const [readState, setReadState] = useState<ReadState>("idle");
  const [isStoreOpen, setIsStoreOpen] = useState(false);
  const [isReadOpen, setIsReadOpen] = useState(false);
  const [showStoreCode, setShowStoreCode] = useState(false);
  const [showReadCode, setShowReadCode] = useState(false);
  const [isStoring, setIsStoring] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [lastStoredMailboxId, setLastStoredMailboxId] = useState<string | null>(null);
  const [retrievedNote, setRetrievedNote] = useState<BulletinPayload | null>(null);

  const resetStoreFields = () => {
    setStoreCode("");
    setStoreText("");
    setShowStoreCode(false);
  };

  const resetReadFields = () => {
    setReadCode("");
    setShowReadCode(false);
    setReadState("idle");
    setRetrievedNote(null);
  };

  const closeStore = () => {
    setIsStoreOpen(false);
    resetStoreFields();
  };

  const closeRead = () => {
    setIsReadOpen(false);
    resetReadFields();
  };

  const handleStore = async () => {
    setStoreState("idle");
    setRetrievedNote(null);

    setIsStoring(true);
    try {
      const request = await encryptBulletinPayload(storeCode, {
        version: 1,
        text: storeText.trim(),
      });

      const response = await fetch("/api/bulletins/store", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error("store_failed");
      }

      setLastStoredMailboxId(request.mailboxId);
      setStoreText("");
      setStoreState("success");
      closeStore();
    } catch (error) {
      if (error instanceof Error && error.message === "invalid_code") {
        setStoreState("invalid");
      } else if (error instanceof Error && error.message === "invalid_payload") {
        setStoreState("invalid");
      } else {
        setStoreState("error");
      }
      closeStore();
    } finally {
      setIsStoring(false);
    }
  };

  const handleRead = async () => {
    setReadState("idle");
    setRetrievedNote(null);

    setIsReading(true);
    try {
      const lookup = await prepareBulletinLookup(readCode);

      if (lookup.mailboxId === lastStoredMailboxId) {
        setReadState("blocked");
        return;
      }

      const response = await fetch("/api/bulletins/read-once", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(lookup),
      });

      if (!response.ok) {
        throw new Error("read_failed");
      }

      const result = (await response.json()) as { note?: { version: number; nonce: string; ciphertext: string } | null };
      if (!result.note) {
        setReadState("miss");
        return;
      }

      const payload = await decryptBulletinPayload(readCode, result.note);
      setRetrievedNote(payload);
      setReadState("success");
    } catch (error) {
      if (error instanceof Error && error.message === "invalid_code") {
        setReadState("miss");
      } else {
        setReadState("error");
      }
    } finally {
      setIsReading(false);
    }
  };

  const helperTone =
    storeState === "success" || readState === "success"
      ? "rgba(104, 211, 145, 0.85)"
      : readState === "blocked" || storeState === "invalid" || readState === "error"
        ? "rgba(252, 129, 129, 0.9)"
        : "var(--weather-text-soft)";

  const helperText =
    storeState === "success"
      ? t("gate.bulletin.feedback.storeSuccess")
      : storeState === "invalid"
        ? t("gate.bulletin.feedback.invalidInput")
        : storeState === "error"
          ? t("gate.bulletin.feedback.storeError")
          : readState === "blocked"
            ? t("gate.bulletin.feedback.readBlocked")
            : readState === "miss"
              ? t("gate.bulletin.feedback.readMiss")
              : readState === "error"
                ? t("gate.bulletin.feedback.readError")
                : readState === "success"
                  ? t("gate.bulletin.feedback.readSuccess")
                  : t("gate.bulletin.heading", { defaultValue: "Leave a comment" });

  const readHelperTone =
    readState === "success"
      ? "rgba(104, 211, 145, 0.85)"
      : readState === "blocked" || readState === "miss" || readState === "error"
        ? "rgba(252, 129, 129, 0.9)"
        : "var(--weather-text-soft)";

  const readHelperText =
    readState === "blocked"
      ? t("gate.bulletin.feedback.readBlocked", { defaultValue: "Immediate read-back is not available after storing from this session." })
      : readState === "miss"
        ? t("gate.bulletin.feedback.readMiss", { defaultValue: "No advisory is available for that code." })
        : readState === "error"
          ? t("gate.bulletin.feedback.readError", { defaultValue: "Advisory could not be opened." })
          : readState === "success"
            ? t("gate.bulletin.feedback.readSuccess", { defaultValue: "Advisory retrieved. It is no longer available for this code." })
            : null;

  return (
    <Stack gap={3} alignItems={{ base: "flex-start", md: "center" }}>
      <HStack gap={2}>
        <ToggleTip
          open={isStoreOpen}
          onOpenChange={(details) => {
            setIsStoreOpen(details.open);
            if (!details.open) {
              resetStoreFields();
            }
          }}
          showArrow
          contentProps={{ p: 4 }}
          content={
            <Stack gap={3}>
              <Text color="var(--weather-label-color)" fontSize="xs" fontWeight="600" letterSpacing="0.12em" textTransform="uppercase">
                {t("gate.bulletin.storeTitle")}
              </Text>
              <Box position="relative">
                <Input
                  value={storeCode}
                  onChange={(event) => setStoreCode(event.target.value)}
                  type={showStoreCode ? "text" : "password"}
                  autoComplete="off"
                  placeholder={t("gate.bulletin.placeholders.storeCode", { defaultValue: "mailbox.passphrase" })}
                  color="var(--weather-input-text)"
                  borderColor="var(--weather-input-border)"
                  bg="var(--weather-input-bg)"
                  pr="2.75rem"
                />
                <IconButton
                  aria-label={showStoreCode ? t("gate.bulletin.actions.hideCode", { defaultValue: "Hide code" }) : t("gate.bulletin.actions.showCode", { defaultValue: "Show code" })}
                  size="sm"
                  variant="ghost"
                  color="var(--weather-text-soft)"
                  position="absolute"
                  top="50%"
                  right="0.25rem"
                  transform="translateY(-50%)"
                  minW="2rem"
                  height="2rem"
                  onClick={() => setShowStoreCode((currentValue) => !currentValue)}
                >
                  {showStoreCode ? <MdVisibilityOff /> : <MdVisibility />}
                </IconButton>
              </Box>
              <Input
                value={storeText}
                onChange={(event) => setStoreText(event.target.value.slice(0, getMaxBulletinTextLength()))}
                placeholder={t("gate.bulletin.placeholders.text")}
                color="var(--weather-input-text)"
                borderColor="var(--weather-input-border)"
                bg="var(--weather-input-bg)"
                maxLength={getMaxBulletinTextLength()}
              />
              <Text color="var(--weather-label-color)" fontSize="xs">
                {t("gate.bulletin.textLimit", { count: getMaxBulletinTextLength() })}
              </Text>
              <HStack gap={2} justifyContent="flex-end">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  color="var(--weather-text-soft)"
                  onClick={closeStore}
                >
                  {t("gate.bulletin.actions.cancel", { defaultValue: "Cancel" })}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  bg="rgba(34, 110, 67, 0.86)"
                  color="white"
                  border="1px solid rgba(109, 219, 135, 0.42)"
                  _hover={{ bg: "rgba(41, 129, 78, 0.92)" }}
                  _disabled={{ opacity: 0.5, cursor: "not-allowed" }}
                  disabled={isStoring}
                  onClick={() => {
                    void handleStore();
                  }}
                >
                  {isStoring ? <Spinner size="sm" /> : t("gate.bulletin.actions.save", { defaultValue: "Save" })}
                </Button>
              </HStack>
            </Stack>
          }
        >
          <Button
            type="button"
            size="sm"
            minW="3rem"
            rounded="full"
            px={3}
            bg="rgba(34, 110, 67, 0.88)"
            color="white"
            border="1px solid rgba(109, 219, 135, 0.42)"
            _hover={{ bg: "rgba(41, 129, 78, 0.92)" }}
            aria-label={t("gate.bulletin.emojiLabels.store", { defaultValue: "Leave advisory" })}
            title={t("gate.bulletin.emojiLabels.store", { defaultValue: "Leave advisory" })}
          >
            <MdChatBubbleOutline size="18px" />
          </Button>
        </ToggleTip>

        <ToggleTip
          open={isReadOpen}
          onOpenChange={(details) => {
            setIsReadOpen(details.open);
            if (!details.open) {
              resetReadFields();
            }
          }}
          showArrow
          contentProps={{ p: 4 }}
          content={
            <Stack gap={3}>
              <Text color="var(--weather-label-color)" fontSize="xs" fontWeight="600" letterSpacing="0.12em" textTransform="uppercase">
                {t("gate.bulletin.readTitle")}
              </Text>
              <Box position="relative">
                <Input
                  value={readCode}
                  onChange={(event) => setReadCode(event.target.value)}
                  type={showReadCode ? "text" : "password"}
                  autoComplete="off"
                  placeholder={t("gate.bulletin.placeholders.readCode", { defaultValue: "mailbox.password" })}
                  color="var(--weather-input-text)"
                  borderColor="var(--weather-input-border)"
                  bg="var(--weather-input-bg)"
                  pr="2.75rem"
                />
                <IconButton
                  aria-label={showReadCode ? t("gate.bulletin.actions.hideCode", { defaultValue: "Hide code" }) : t("gate.bulletin.actions.showCode", { defaultValue: "Show code" })}
                  size="sm"
                  variant="ghost"
                  color="var(--weather-text-soft)"
                  position="absolute"
                  top="50%"
                  right="0.25rem"
                  transform="translateY(-50%)"
                  minW="2rem"
                  height="2rem"
                  onClick={() => setShowReadCode((currentValue) => !currentValue)}
                >
                  {showReadCode ? <MdVisibilityOff /> : <MdVisibility />}
                </IconButton>
              </Box>
              <HStack gap={2} justifyContent="flex-end">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  color="var(--weather-text-soft)"
                  onClick={closeRead}
                >
                  {t("gate.bulletin.actions.close", { defaultValue: "Close" })}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  bg="rgba(34, 110, 67, 0.86)"
                  color="white"
                  border="1px solid rgba(109, 219, 135, 0.42)"
                  _hover={{ bg: "rgba(41, 129, 78, 0.92)" }}
                  _disabled={{ opacity: 0.5, cursor: "not-allowed" }}
                  disabled={isReading}
                  onClick={() => {
                    void handleRead();
                  }}
                >
                  {isReading ? <Spinner size="sm" /> : t("gate.bulletin.actions.read", { defaultValue: "Read" })}
                </Button>
              </HStack>

              {readHelperText ? (
                <Text color={readHelperTone} fontSize="sm">
                  {readHelperText}
                </Text>
              ) : null}

              {retrievedNote ? (
                <Box borderRadius="lg" border="1px solid var(--weather-chip-border)" bg="var(--weather-subtle-card-bg)" p={3}>
                  <Stack gap={2}>
                    <Text color="var(--weather-text-main)" fontSize="sm" fontWeight="600">
                      {t("gate.bulletin.retrievedTitle", { defaultValue: "Retrieved advisory" })}
                    </Text>
                    <Text color="var(--weather-text-main)" fontSize="sm">
                      {retrievedNote.text}
                    </Text>
                    <Text color="var(--weather-label-color)" fontSize="xs">
                      {t("gate.bulletin.retrievedHint", { defaultValue: "This advisory was removed after retrieval." })}
                    </Text>
                  </Stack>
                </Box>
              ) : null}
            </Stack>
          }
        >
          <Button
            type="button"
            size="sm"
            minW="3rem"
            rounded="full"
            px={3}
            bg="rgba(34, 110, 67, 0.88)"
            color="white"
            border="1px solid rgba(109, 219, 135, 0.42)"
            _hover={{ bg: "rgba(41, 129, 78, 0.92)" }}
            aria-label={t("gate.bulletin.emojiLabels.read", { defaultValue: "Check advisory" })}
            title={t("gate.bulletin.emojiLabels.read", { defaultValue: "Check advisory" })}
          >
            <MdForum size="18px" />
          </Button>
        </ToggleTip>
      </HStack>

      <Text color={helperTone} fontSize="sm" maxW="24rem">
        {helperText}
      </Text>
    </Stack>
  );
}