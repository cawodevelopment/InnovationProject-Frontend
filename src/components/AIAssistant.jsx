import { useState, useEffect, useRef } from 'react';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import { useNavigate } from 'react-router-dom';

const LISTEN_OPTIONS = { continuous: true, interimResults: true };
const NO_SPEECH_TIMEOUT = 5000;
const POST_SPEECH_TIMEOUT = 1400;
const CREATE_PROMPT_READY_DELAY = 1200;
const CREATE_POST_SPEECH_TIMEOUT = 2600;
const REFINE_PROMPT_READY_DELAY = 1000;
const REFINE_POST_SPEECH_TIMEOUT = 2400;
const TYPE_SPEED = 45;
const WAKE_WORD = 'okay clove';
const WAKE_WORD_RESPONSES = [
  'What can I help you with?',
  'I am listening.',
  'Ready when you are.',
  'How can I help?',
  'What should we do?',
];

const NAVIGATION_INTENTS = [
  {
    route: '/',
    response: 'Opening home.',
    phrases: [
      'recipes',
      'home',
      'show recipes',
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

const getRecipeId = (recipe) => {
  if (!recipe || typeof recipe !== 'object') {
    return '';
  }

  const id = recipe.id ?? recipe.recipeId ?? recipe._id;
  return id === undefined || id === null ? '' : String(id);
};

const normalizeRecipeTitle = (title) =>
  String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const getLevenshteinDistance = (left, right) => {
  if (left === right) {
    return 0;
  }

  if (!left.length) {
    return right.length;
  }

  if (!right.length) {
    return left.length;
  }

  const matrix = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));

  for (let row = 0; row <= left.length; row += 1) {
    matrix[row][0] = row;
  }

  for (let column = 0; column <= right.length; column += 1) {
    matrix[0][column] = column;
  }

  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;

      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitutionCost
      );
    }
  }

  return matrix[left.length][right.length];
};

const getStringSimilarity = (left, right) => {
  const maxLength = Math.max(left.length, right.length);

  if (!maxLength) {
    return 1;
  }

  const distance = getLevenshteinDistance(left, right);
  return 1 - distance / maxLength;
};

const getTokenOverlapScore = (left, right) => {
  const leftTokens = new Set(left.split(' ').filter(Boolean));
  const rightTokens = new Set(right.split(' ').filter(Boolean));

  if (!leftTokens.size || !rightTokens.size) {
    return 0;
  }

  let sharedCount = 0;

  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) {
      sharedCount += 1;
    }
  });

  return sharedCount / Math.max(leftTokens.size, rightTokens.size);
};

const isDeleteCommand = (normalizedCommand) => {
  const deletePatterns = [
    /^delete\b/,
    /\bdelete\s+(this\s+)?recipe\b/,
    /\bremove\s+(this\s+)?recipe\b/,
    /\bdiscard\b/,
  ];

  return deletePatterns.some((pattern) => pattern.test(normalizedCommand));
};

const isRefineCommand = (normalizedCommand) => {
  const refinePatterns = [
    /^refine\b/,
    /^refined\b/,
    /\brefine\s+recipe\b/,
    /\brefined\s+recipe\b/,
    /\brefine\s+(this\s+)?recipe\b/,
    /\brefined\s+(this\s+)?recipe\b/,
    /\bclick\s+(the\s+)?refine\b/,
    /\bclick\s+(the\s+)?refined\b/,
    /\bopen\s+refine\b/,
    /\bopen\s+refined\b/,
    /\brefine\s+it\b/,
    /\brefined\s+it\b/,
  ];

  return refinePatterns.some((pattern) => pattern.test(normalizedCommand));
};

const isRefinePromptStartCommand = (normalizedCommand) => {
  const startPatterns = [
    /^refine\b/,
    /^refined\b/,
    /\brefine\s+draft\b/,
    /\brefine\s+recipe\b/,
    /\brefine\s+(this\s+)?draft\b/,
    /\brefine\s+(this\s+)?recipe\b/,
  ];

  return startPatterns.some((pattern) => pattern.test(normalizedCommand));
};

const isBackToRecipeCommand = (normalizedCommand) => {
  const backPatterns = [
    /^go\s+back$/,
    /^back$/,
    /\bback\s+to\s+recipe\b/,
    /\bgo\s+back\s+to\s+recipe\b/,
    /\breturn\s+to\s+recipe\b/,
    /\bview\s+recipe\b/,
    /\bshow\s+recipe\b/,
  ];

  return backPatterns.some((pattern) => pattern.test(normalizedCommand));
};

const extractRecipeQuery = (normalizedCommand) => {
  const patterns = [
    /^open\s+recipe\s+named\s+(.+)$/,
    /^open\s+recipe\s+called\s+(.+)$/,
    /^open\s+recipe\s+(.+)$/,
    /^show\s+recipe\s+named\s+(.+)$/,
    /^show\s+recipe\s+called\s+(.+)$/,
    /^show\s+recipe\s+(.+)$/,
    /^open\s+(.+)$/,
    /^show\s+(.+)$/,
  ];

  for (const pattern of patterns) {
    const match = normalizedCommand.match(pattern);

    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return '';
};

const extractDraftQuery = (normalizedCommand) => {
  const patterns = [
    /^refine\s+draft\s+named\s+(.+)$/,
    /^refined\s+draft\s+named\s+(.+)$/,
    /^refine\s+draft\s+called\s+(.+)$/,
    /^refined\s+draft\s+called\s+(.+)$/,
    /^refine\s+draft\s+(.+)$/,
    /^refined\s+draft\s+(.+)$/,
    /^refine\s+(.+)$/,
    /^refined\s+(.+)$/,
  ];

  for (const pattern of patterns) {
    const match = normalizedCommand.match(pattern);

    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return '';
};

const extractSaveDraftQuery = (normalizedCommand) => {
  const patterns = [
    /^save\s+(.+)$/,
    /^save\s+draft\s+named\s+(.+)$/,
    /^saved\s+draft\s+named\s+(.+)$/,
    /^save\s+draft\s+called\s+(.+)$/,
    /^saved\s+draft\s+called\s+(.+)$/,
    /^save\s+draft\s+(.+)$/,
    /^saved\s+draft\s+(.+)$/,
  ];

  for (const pattern of patterns) {
    const match = normalizedCommand.match(pattern);

    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return '';
};

const extractCreatePromptQuery = (normalizedCommand) => {
  const patterns = [
    /^create\s+recipe\s+(.+)$/,
    /^create\s+recipes\s+(.+)$/,
    /^generate\s+recipe\s+(.+)$/,
    /^generate\s+recipes\s+(.+)$/,
  ];

  for (const pattern of patterns) {
    const match = normalizedCommand.match(pattern);

    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return '';
};

const findRecipeByQuery = (recipes, rawQuery) => {
  const candidates = Array.isArray(recipes) ? recipes : [];
  const normalizedQuery = normalizeRecipeTitle(rawQuery);

  if (!normalizedQuery) {
    return null;
  }

  const scored = candidates
    .map((recipe) => {
      const title = String(recipe?.title ?? '').trim();
      const normalizedTitle = normalizeRecipeTitle(title);

      if (!title || !normalizedTitle) {
        return null;
      }

      let score = 0;

      if (normalizedTitle === normalizedQuery) {
        score = 1;
      } else if (normalizedTitle.startsWith(normalizedQuery)) {
        score = 0.95;
      } else if (normalizedTitle.includes(normalizedQuery) || normalizedQuery.includes(normalizedTitle)) {
        score = 0.9;
      } else {
        const similarityScore = getStringSimilarity(normalizedTitle, normalizedQuery);
        const tokenOverlapScore = getTokenOverlapScore(normalizedTitle, normalizedQuery);
        score = Math.max(similarityScore, tokenOverlapScore);
      }

      if (score < 0.58) {
        return null;
      }

      return { recipe, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.recipe.title.length - b.recipe.title.length);

  return scored[0]?.recipe ?? null;
};

const findRecipeByName = (recipes, rawCommand) => {
  const normalizedCommand = normalizeCommand(rawCommand);
  const query = extractRecipeQuery(normalizedCommand);

  if (!query) {
    return null;
  }

  return findRecipeByQuery(recipes, query);
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

const getWakeWordResponse = (lastResponse) => {
  if (!WAKE_WORD_RESPONSES.length) {
    return 'What can I help you with?';
  }

  const options = WAKE_WORD_RESPONSES.filter((response) => response !== lastResponse);
  const pool = options.length > 0 ? options : WAKE_WORD_RESPONSES;
  const randomIndex = Math.floor(Math.random() * pool.length);

  return pool[randomIndex];
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

const getRecipeIdFromPath = (path) => {
  const match = path.match(/^\/recipes\/([^/]+)\/?$/);
  return match?.[1] ?? null;
};

const getRecipeIdFromRefinePath = (path) => {
  const match = path.match(/^\/recipes\/([^/]+)\/refine\/?$/);
  return match?.[1] ?? null;
};

const getDraftRecipeIdFromRefinePath = (path) => {
  const match = path.match(/^\/drafts\/([^/]+)\/refine\/?$/);
  return match?.[1] ?? null;
};

const AIComponent = ({
  currentPath = '',
  homeRecipes = [],
  createDrafts = [],
  onDeleteRecipe,
  onRefineRecipe,
  onRefineDraft,
  onSaveDraft,
  onRefineRecipePrompt,
  onRefineRecipePromptLive,
  onRefineDraftPrompt,
  onRefineDraftPromptLive,
  onCreateVoicePrompt,
  onCreateVoicePromptLive,
  onResetCreateView,
}) => {
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
  const lastWakeResponse = useRef('');
  const awaitingCreatePrompt = useRef(false);
  const createPromptReadyAt = useRef(0);
  const awaitingRefinePrompt = useRef(false);
  const refinePromptReadyAt = useRef(0);

  const isAwaitingCreatePrompt = awaitingCreatePrompt.current && currentPath === '/create';
  const isAwaitingRefinePrompt =
    awaitingRefinePrompt.current &&
    (getRecipeIdFromRefinePath(currentPath) !== null || getDraftRecipeIdFromRefinePath(currentPath) !== null);
  const waitingText = (isAwaitingCreatePrompt || isAwaitingRefinePrompt)
    ? 'Waiting for prompt...'
    : `Waiting for "${WAKE_WORD}"...`;
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
    const normalizedCmd = normalizeCommand(rawText);
    const isOnCreatePage = currentPath === '/create';

    if (isOnCreatePage) {
      const createPromptQuery = extractCreatePromptQuery(normalizedCmd);

      if (createPromptQuery) {
        if (onCreateVoicePrompt) {
          onCreateVoicePrompt(createPromptQuery);
          speakResponse('Generating recipes.');
        } else {
          speakResponse('I cannot send a create prompt right now.');
        }
        return;
      }

      if (/^(create|generate)(\s+recipe|\s+recipes)?$/.test(normalizedCmd)) {
        awaitingCreatePrompt.current = true;
        createPromptReadyAt.current = Date.now() + CREATE_PROMPT_READY_DELAY;
        if (onCreateVoicePromptLive) {
          onCreateVoicePromptLive('');
        }
        speakResponse('Tell me your prompt.');
        return;
      }
    }

    const intent = getNavigationIntent(rawText);

    if (intent) {
      if (intent.route === '/create' && isOnCreatePage) {
        awaitingCreatePrompt.current = true;
        createPromptReadyAt.current = Date.now() + CREATE_PROMPT_READY_DELAY;
        if (onCreateVoicePromptLive) {
          onCreateVoicePromptLive('');
        }
        speakResponse('Tell me your prompt.');
        return;
      }

      if (intent.route === '/create') {
        awaitingCreatePrompt.current = true;
        createPromptReadyAt.current = Date.now() + CREATE_PROMPT_READY_DELAY;
        if (onResetCreateView) {
          onResetCreateView();
        }
        if (onCreateVoicePromptLive) {
          onCreateVoicePromptLive('');
        }
        navigate('/create');
        speakResponse('Opening Create page. Tell me your prompt.');
        return;
      }

      navigate(intent.route);
      speakResponse(intent.response);
      return;
    }

    const isOnRecipePage = getRecipeIdFromPath(currentPath) !== null;
    const recipeIdFromRefinePath = getRecipeIdFromRefinePath(currentPath);
    const draftIdFromRefinePath = getDraftRecipeIdFromRefinePath(currentPath);
    const isOnRecipeRefinePage = recipeIdFromRefinePath !== null;
    const isOnDraftRefinePage = draftIdFromRefinePath !== null;
    const isOnAnyRefinePage = isOnRecipeRefinePage || isOnDraftRefinePage;
    const isInCreatePromptMode = awaitingCreatePrompt.current && isOnCreatePage;
    const isInRefinePromptMode = awaitingRefinePrompt.current && isOnAnyRefinePage;

    const saveDraftQuery = extractSaveDraftQuery(normalizedCmd);

    if (!isInCreatePromptMode && !isInRefinePromptMode && isOnCreatePage && saveDraftQuery) {
      const draftByName = findRecipeByQuery(createDrafts, saveDraftQuery);

      if (!draftByName) {
        speakResponse('I could not find that draft. Please say save draft and the draft name shown on screen.');
        return;
      }

      if (!onSaveDraft) {
        speakResponse('I cannot save that draft right now.');
        return;
      }

      speakResponse(`Saving draft ${draftByName.title}.`);

      Promise.resolve(onSaveDraft(draftByName)).catch(() => {
        // Keep the response simple; the app will surface save failures in the UI.
      });
      return;
    }

    if (isOnRecipeRefinePage && isBackToRecipeCommand(normalizedCmd)) {
      navigate(`/recipes/${encodeURIComponent(recipeIdFromRefinePath)}`);
      speakResponse('Going back to recipe details.');
      return;
    }

    if (isOnAnyRefinePage && isRefinePromptStartCommand(normalizedCmd) && !isInRefinePromptMode) {
      awaitingRefinePrompt.current = true;
      refinePromptReadyAt.current = Date.now() + REFINE_PROMPT_READY_DELAY;

      if (isOnRecipeRefinePage && onRefineRecipePromptLive) {
        onRefineRecipePromptLive('');
      }

      if (isOnDraftRefinePage && onRefineDraftPromptLive) {
        onRefineDraftPromptLive('');
      }

      speakResponse('Tell me your refine prompt.');
      return;
    }

    if (isOnRecipePage && isDeleteCommand(normalizedCmd)) {
      if (onDeleteRecipe) {
        onDeleteRecipe();
        speakResponse('Deleting this recipe.');
      } else {
        speakResponse('I cannot delete this recipe right now.');
      }
      return;
    }

    if (isOnRecipePage && isRefineCommand(normalizedCmd)) {
      if (onRefineRecipe) {
        onRefineRecipe();
        awaitingRefinePrompt.current = true;
        refinePromptReadyAt.current = Date.now() + REFINE_PROMPT_READY_DELAY;
        if (onRefineRecipePromptLive) {
          onRefineRecipePromptLive('');
        }
        speakResponse('Opening refine for this recipe. Tell me your refine prompt.');
      } else {
        speakResponse('I cannot open refine right now.');
      }
      return;
    }

    const draftQuery = extractDraftQuery(normalizedCmd);

    if (!isInCreatePromptMode && isOnCreatePage && draftQuery) {
      const draftByName = findRecipeByQuery(createDrafts, draftQuery);

      if (!draftByName) {
        speakResponse('I could not find that draft. Please say refine draft and the draft name shown on screen.');
        return;
      }

      if (!onRefineDraft) {
        speakResponse('I cannot open draft refine right now.');
        return;
      }

      onRefineDraft(draftByName);
      awaitingRefinePrompt.current = true;
      refinePromptReadyAt.current = Date.now() + REFINE_PROMPT_READY_DELAY;
      if (onRefineDraftPromptLive) {
        onRefineDraftPromptLive('');
      }
      speakResponse(`Opening refine for draft ${draftByName.title}. Tell me your refine prompt.`);
      return;
    }

    const recipeQuery = extractRecipeQuery(normalizedCmd);

    if (currentPath !== '/' && recipeQuery) {
      return;
    }

    const recipeByName = findRecipeByName(homeRecipes, rawText);

    if (recipeByName) {
      const recipeId = getRecipeId(recipeByName);

      if (!recipeId) {
        speakResponse('I found that recipe, but I cannot open it right now.');
        return;
      }

      navigate(`/recipes/${encodeURIComponent(recipeId)}`);
      speakResponse(`Opening ${recipeByName.title}.`);
      return;
    }

    speakResponse(
      currentPath === '/'
        ? 'Try saying open recipe plus the recipe name, or open Home, Create, Account, or Privacy Policy.'
        : 'I can open Home, Create, Account, or Privacy Policy. On a recipe page, try saying refine recipe. On a refine page, you can say go back. On Create, say refine draft or save draft and the draft name.'
    );
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
    const isInCreatePromptMode = awaitingCreatePrompt.current && currentPath === '/create';
    const isInRefinePromptMode =
      awaitingRefinePrompt.current &&
      (getRecipeIdFromRefinePath(currentPath) !== null || getDraftRecipeIdFromRefinePath(currentPath) !== null);

    if (!listening || wakeWordDetected || isSpeaking || isIgnoringInput.current || isInCreatePromptMode || isInRefinePromptMode) return;

    const currentText = (interimTranscript || transcript).toLowerCase();

    if (currentText.includes(WAKE_WORD)) {
      setWakeWordDetected(true);
      setDisplayText('');
      const wakeResponse = getWakeWordResponse(lastWakeResponse.current);
      lastWakeResponse.current = wakeResponse;
      speakResponse(wakeResponse);
    }
  }, [transcript, interimTranscript, listening, wakeWordDetected, isSpeaking, currentPath]);

  useEffect(() => {
    const isInCreatePromptMode = awaitingCreatePrompt.current && currentPath === '/create';
    const isInRefinePromptMode =
      awaitingRefinePrompt.current &&
      (getRecipeIdFromRefinePath(currentPath) !== null || getDraftRecipeIdFromRefinePath(currentPath) !== null);
    const canCaptureSpeech = wakeWordDetected || isInCreatePromptMode || isInRefinePromptMode;
    const isCreatePromptReady = !isInCreatePromptMode || Date.now() >= createPromptReadyAt.current;
    const isRefinePromptReady = !isInRefinePromptMode || Date.now() >= refinePromptReadyAt.current;
    const recipeIdFromRefinePath = getRecipeIdFromRefinePath(currentPath);
    const draftIdFromRefinePath = getDraftRecipeIdFromRefinePath(currentPath);
    const isOnRecipeRefinePage = recipeIdFromRefinePath !== null;
    const isOnDraftRefinePage = draftIdFromRefinePath !== null;

    if (!listening || !canCaptureSpeech || !isCreatePromptReady || !isRefinePromptReady || isSpeaking || isIgnoringInput.current) {
      clearRefTimeout(silenceTimer);
      return;
    }

    const currentText = interimTranscript || transcript;
    const trimmedText = currentText.trim();

    if (isInCreatePromptMode && onCreateVoicePromptLive) {
      onCreateVoicePromptLive(currentText);
    }

    if ((isInRefinePromptMode || wakeWordDetected) && isOnRecipeRefinePage && onRefineRecipePromptLive) {
      onRefineRecipePromptLive(currentText);
    }

    if ((isInRefinePromptMode || wakeWordDetected) && isOnDraftRefinePage && onRefineDraftPromptLive) {
      onRefineDraftPromptLive(currentText);
    }

    if (trimmedText) {
      setDisplayText(currentText);
    }

    clearRefTimeout(silenceTimer);
    silenceTimer.current = setTimeout(() => {
      const finalCommand = (interimTranscript || transcript || '').trim();

      if (finalCommand) {
        if (isInCreatePromptMode) {
          awaitingCreatePrompt.current = false;
          if (onCreateVoicePromptLive) {
            onCreateVoicePromptLive('');
          }

          if (onCreateVoicePrompt) {
            onCreateVoicePrompt(finalCommand);
            speakResponse('Generating recipes.');
          } else {
            speakResponse('I cannot send a create prompt right now.');
          }
        } else if (isInRefinePromptMode) {
          awaitingRefinePrompt.current = false;

          if (isOnRecipeRefinePage) {
            if (onRefineRecipePromptLive) {
              onRefineRecipePromptLive('');
            }

            if (onRefineRecipePrompt) {
              onRefineRecipePrompt(finalCommand);
              speakResponse('Refining this recipe.');
            } else {
              speakResponse('I cannot refine this recipe right now.');
            }
          } else if (isOnDraftRefinePage) {
            if (onRefineDraftPromptLive) {
              onRefineDraftPromptLive('');
            }

            if (onRefineDraftPrompt) {
              onRefineDraftPrompt(finalCommand);
              speakResponse('Refining this draft.');
            } else {
              speakResponse('I cannot refine this draft right now.');
            }
          }
        } else {
          handleVoiceCommand(finalCommand);
        }
      }

      endCommandCapture({ clearResponse: !finalCommand });
      silenceTimer.current = null;
    }, trimmedText
      ? (isInCreatePromptMode
          ? CREATE_POST_SPEECH_TIMEOUT
          : isInRefinePromptMode
            ? REFINE_POST_SPEECH_TIMEOUT
            : POST_SPEECH_TIMEOUT)
      : NO_SPEECH_TIMEOUT);
  }, [
    transcript,
    interimTranscript,
    listening,
    wakeWordDetected,
    isSpeaking,
    currentPath,
    onRefineRecipePromptLive,
    onRefineDraftPromptLive,
    onCreateVoicePrompt,
    onCreateVoicePromptLive,
  ]);

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
      awaitingCreatePrompt.current = false;
      awaitingRefinePrompt.current = false;
      if (onCreateVoicePromptLive) {
        onCreateVoicePromptLive('');
      }
      if (onRefineRecipePromptLive) {
        onRefineRecipePromptLive('');
      }
      if (onRefineDraftPromptLive) {
        onRefineDraftPromptLive('');
      }
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