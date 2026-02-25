import { Button, Input, Spinner, Box, Heading, Field } from "@chakra-ui/react";
import React from "react";
import { useState } from "react";
import { hashPhrase } from "../utils/crypto";

interface JoinRoomProps {
  onJoinRoom: (roomId: string) => void;
}

export const JoinRoom: React.FC<JoinRoomProps> = ({ onJoinRoom }) => {
  const [passPhrase, setPassPhrase] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const isPassPhraseValid = passPhrase.trim().length > 12;
  const [touched, setTouched] = useState(false);

  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      height="100vh"
    >
      <Heading mb={6}>Join a Call Room</Heading>
      <Field.Root
        mb={4}
        onBlur={() => setTouched(true)}
        invalid={!isPassPhraseValid && touched}
      >
        <Field.Label>Passphrase (more than 16 characters)</Field.Label>
        <Input
          placeholder="Passphrase"
          onChange={(e) => setPassPhrase(e.target.value)}
          value={passPhrase}
          mt={4}
          mb={4}
          size="lg"
        />
        <Field.ErrorText>
          Passphrase must be more than 16 characters.
        </Field.ErrorText>
      </Field.Root>
      <Button
        disabled={!isPassPhraseValid || isLoading}
        mt={4}
        onClick={async () => {
          setIsLoading(true);
          try {
            const hashed = await hashPhrase(passPhrase);
            onJoinRoom(hashed);
          } catch (error) {
            // Handle error
            console.error("Hashing failed:", error);
          } finally {
            setIsLoading(false);
          }
        }}
      >
        Submit passphrase
      </Button>
      {isLoading && <Spinner mt={4} />}
      
      
      </Box>
      
  );
};
