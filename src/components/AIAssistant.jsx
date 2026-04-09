import { useState, useEffect, useRef } from 'react';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import { useNavigate } from 'react-router-dom';

const LISTEN_OPTIONS = { continuous: true, interimResults: true };
const NO_SPEECH_TIMEOUT = 5000;
const POST_SPEECH_TIMEOUT = 1400;
const TYPE_SPEED = 45;
const WAKE_WORD = 'okay clove';

const NAVIGATION_INTENTS = [
  {
    route: '/',
    response: 'Opening Home recipes.',
    phrases: [
      'recipes',
      'home',
      'show recipes',
      'show my recipes',
      'go home',
      'take me home',
      'open home',
      'go to home',
      'open recipes',
      'show home',
    ],
  },
  {
    route: '/create',
    response: 'Opening Create page.',
    phrases: [
      'create',
      'create recipe',
      'create recipes',
      'open create',
      'go to create',
      'take me to create',
      'new recipe',
      'generate recipe',
      'generate recipes',
    ],
  },
  {
    route: '/account',
    response: 'Opening Account page.',
    phrases: [
      'account',
      'open account',
      'go to account',
      'take me to account',
      'show account',
      'my account',
      'profile',
      'open profile',
    ],
  },
  {
    route: '/privacy-policy',
    response: 'Opening Privacy Policy.',
    phrases: [
      'privacy',
      'open privacy',
      'privacy policy',
      'show privacy policy',
      'go to privacy',
      'open privacy policy',
    ],
  },
];

const normalizeCommand = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const getNavigationIntent = (rawText) => {
  const command = normalizeCommand(rawText);

  if (!command) {
    return null;
  }

  return (
    NAVIGATION_INTENTS.find((intent) =>
      intent.phrases.some((phrase) => command.includes(phrase))
    ) ?? null
  );
};

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
  const navigate = useNavigate();
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

  const resetConversationState = (options = {}) => {
    const { clearResponse = true } = options;

    setWakeWordDetected(false);
    setDisplayText('');

    if (clearResponse) {
      setAiResponseText('');
    }
  };

  const endCommandCapture = (options = {}) => {
    resetTranscript();
    resetConversationState(options);
  };

  const handleVoiceCommand = (rawText) => {
    const intent = getNavigationIntent(rawText);

    if (!intent) {
      speakResponse(
        'I can open Home, Create, Account, or Privacy Policy. Please try again.'
      );
      return;
    }

    navigate(intent.route);
    speakResponse(intent.response);
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
      const finalCommand = (interimTranscript || transcript || '').trim();

      if (finalCommand) {
        handleVoiceCommand(finalCommand);
      }

      endCommandCapture({ clearResponse: !finalCommand });
      silenceTimer.current = null;
    }, trimmedText ? POST_SPEECH_TIMEOUT : NO_SPEECH_TIMEOUT);
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