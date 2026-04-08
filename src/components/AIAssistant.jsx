import { useState, useEffect, useRef } from 'react';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';

const LISTEN_OPTIONS = { continuous: true, interimResults: true };
const SILENCE_TIMEOUT = 5000;
const TYPE_SPEED = 45;
const WAKE_WORD = 'okay clove';

const clearRefTimeout = (timerRef) => {
  if (timerRef.current) {
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }
};

const clearRefInterval = (timerRef) => {
  if (timerRef.current) {
    clearInterval(timerRef.current);
    timerRef.current = null;
  }
};

const useTypewriter = (text, enabled) => {
  const [typedText, setTypedText] = useState('');
  const timerRef = useRef(null);

  useEffect(() => {
    clearRefInterval(timerRef);

    if (!enabled || !text) {
      setTypedText('');
      return;
    }

    let index = 0;
    setTypedText('');

    timerRef.current = setInterval(() => {
      index += 1;
      setTypedText(text.slice(0, index));

      if (index >= text.length) {
        clearRefInterval(timerRef);
      }
    }, TYPE_SPEED);

    return () => clearRefInterval(timerRef);
  }, [text, enabled]);

  return typedText;
};

const AIComponent = () => {
  const {
    transcript,
    interimTranscript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
  } = useSpeechRecognition();

  const [wakeWordDetected, setWakeWordDetected] = useState(false);
  const [displayText, setDisplayText] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [aiResponseText, setAiResponseText] = useState('');

  const silenceTimer = useRef(null);
  const isIgnoringInput = useRef(false);

  const waitingText = `Waiting for "${WAKE_WORD}"...`;
  const isTranscribing = listening && wakeWordDetected && !isSpeaking;

  const typedAiResponse = useTypewriter(aiResponseText, isSpeaking);
  const typedWaitingText = useTypewriter(
    waitingText,
    listening && !wakeWordDetected && !isSpeaking
  );

  const resetConversationState = () => {
    setWakeWordDetected(false);
    setDisplayText('');
    setAiResponseText('');
  };

  const endCommandCapture = () => {
    resetTranscript();
    resetConversationState();
  };

  const speakResponse = (text) => {
    setAiResponseText(text);
    isIgnoringInput.current = true;
    SpeechRecognition.stopListening();
    resetTranscript();
    setIsSpeaking(true);
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;

    utterance.onend = () => {
      resetTranscript();
      setIsSpeaking(false);
      isIgnoringInput.current = false;
      SpeechRecognition.startListening(LISTEN_OPTIONS);
    };

    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    if (!listening || wakeWordDetected || isSpeaking || isIgnoringInput.current) return;

    const currentText = (interimTranscript || transcript).toLowerCase();

    if (currentText.includes(WAKE_WORD)) {
      setWakeWordDetected(true);
      setDisplayText('');
      speakResponse('What can I help you with?');
    }
  }, [transcript, interimTranscript, listening, wakeWordDetected, isSpeaking]);

  useEffect(() => {
    if (!listening || !wakeWordDetected || isSpeaking || isIgnoringInput.current) {
      clearRefTimeout(silenceTimer);
      return;
    }

    const currentText = interimTranscript || transcript;
    const trimmedText = currentText.trim();

    if (trimmedText) {
      setDisplayText(currentText);
    }

    clearRefTimeout(silenceTimer);
    silenceTimer.current = setTimeout(() => {
      endCommandCapture();
      silenceTimer.current = null;
    }, SILENCE_TIMEOUT);
  }, [transcript, interimTranscript, listening, wakeWordDetected, isSpeaking]);

  useEffect(
    () => () => {
      clearRefTimeout(silenceTimer);
      window.speechSynthesis.cancel();
    },
    []
  );

  const toggleListening = () => {
    if (listening || isSpeaking) {
      SpeechRecognition.stopListening();
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      isIgnoringInput.current = false;
      resetConversationState();
      return;
    }

    resetTranscript();
    setWakeWordDetected(false);
    setDisplayText('');
    isIgnoringInput.current = false;
    SpeechRecognition.startListening(LISTEN_OPTIONS);
  };

  if (!browserSupportsSpeechRecognition) {
    return <p>Browser doesn't support speech recognition.</p>;
  }

  return (
    <div className="ai-component">
      {isSpeaking && (
        <p className="ai-response">
          {typedAiResponse || '...'}
          <span className="typing-cursor" aria-hidden="true">|</span>
        </p>
      )}

      {listening && !wakeWordDetected && !isSpeaking && (
        <p className="ai-response">
          {typedWaitingText || '...'}
          <span className="typing-cursor" aria-hidden="true">|</span>
        </p>
      )}

      {wakeWordDetected && !isSpeaking && (
        <p className="ai-response">{displayText || '...'}</p>
      )}

      <button
        onClick={toggleListening}
        className={isTranscribing ? 'is-transcribing' : ''}
      >
        {listening || isSpeaking ? '\uD83D\uDD0A' : '\uD83D\uDD07'}
      </button>
    </div>
  );
};

export default AIComponent;