import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, VolumeX, MessageSquare, MessageSquareOff } from 'lucide-react';

const RealEstateAssistant = () => {
  // State management
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isTextMode, setIsTextMode] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLiveConversation, setIsLiveConversation] = useState(false);
  const [language, setLanguage] = useState('en-US');

  // Refs
  const recognitionRef = useRef(null);
  const messagesEndRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioAnalyserRef = useRef(null);
  const silenceTimeoutRef = useRef(null);

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = language;
        
        recognitionRef.current.onresult = (event) => {
          const transcript = Array.from(event.results)
            .map(result => result[0].transcript)
            .join('');
          
          if (isTextMode) {
            setInputText(transcript);
          } else {
            handleLiveInput(transcript);
          }
        };

        recognitionRef.current.onend = () => {
          if (isLiveConversation) {
            recognitionRef.current.start(); // Keep listening in live mode
          } else {
            setIsListening(false);
          }
        };

        recognitionRef.current.onerror = (event) => {
          console.error('Speech recognition error:', event.error);
          if (!isLiveConversation) {
            setIsListening(false);
          }
        };
      }
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [language, isLiveConversation, isTextMode]);

  // Initialize audio context for silence detection
  const initializeAudioContext = async () => {
    try {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      audioAnalyserRef.current = audioContextRef.current.createAnalyser();
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(audioAnalyserRef.current);
      
      // Set up silence detection
      const bufferLength = audioAnalyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      const checkSilence = () => {
        if (!isLiveConversation) return;
        
        audioAnalyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / bufferLength;
        
        if (average < 10) { // Silence threshold
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = setTimeout(() => {
            if (!isSpeaking && inputText.trim()) {
              handleSend();
            }
          }, 1500); // Wait 1.5 seconds of silence before sending
        }
      };
      
      setInterval(checkSilence, 100);
    } catch (error) {
      console.error('Error initializing audio context:', error);
    }
  };

  // Auto-scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Handle live conversation input
  const handleLiveInput = (transcript) => {
    setInputText(transcript);
    // The silence detection will trigger handleSend when the user stops speaking
  };

  // Toggle voice recognition modes
  const toggleTextMode = () => {
    if (isListening) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
    setIsLiveConversation(false);
    setIsTextMode(true);
    setInputText('');
  };

  const toggleLiveConversation = async () => {
    if (!isLiveConversation) {
      setIsTextMode(false);
      setIsLiveConversation(true);
      await initializeAudioContext();
      recognitionRef.current.start();
    } else {
      recognitionRef.current.stop();
      setIsLiveConversation(false);
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    }
  };

  const toggleVoiceRecognition = () => {
    if (!recognitionRef.current) return;

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  // Handle message sending
  const handleSend = async () => {
    if (!inputText.trim()) return;

    // Add user message
    const newMessage = {
      type: 'user',
      text: inputText,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, newMessage]);
    setInputText('');

    try {
      // Call OpenAI API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: inputText,
          language: language
        }),
      });

      const data = await response.json();
      
      // Add AI response
      const aiMessage = {
        type: 'assistant',
        text: data.response,
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, aiMessage]);
      
      // Speak the response
      if (data.response) {
        await speakResponse(data.response);
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  // Text-to-speech function with interruption support
  const speakResponse = async (text) => {
    if (!text) return;
    
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      if (isLiveConversation) {
        recognitionRef.current.start(); // Resume listening after speaking
      }
    };
    
    return new Promise((resolve) => {
      utterance.onend = () => {
        setIsSpeaking(false);
        if (isLiveConversation) {
          recognitionRef.current.start();
        }
        resolve();
      };
      
      setIsSpeaking(true);
      window.speechSynthesis.speak(utterance);
    });
  };

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto p-4 bg-gray-50">
      {/* Mode Toggle Buttons */}
      <div className="flex justify-center space-x-4 mb-4">
        <button
          onClick={toggleTextMode}
          className={`px-4 py-2 rounded-lg ${
            isTextMode ? 'bg-blue-500 text-white' : 'bg-gray-200'
          }`}
        >
          Voice to Text
        </button>
        <button
          onClick={toggleLiveConversation}
          className={`px-4 py-2 rounded-lg ${
            isLiveConversation ? 'bg-green-500 text-white' : 'bg-gray-200'
          }`}
        >
          Live Conversation
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto mb-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${
              message.type === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-[80%] p-3 rounded-lg ${
                message.type === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white border border-gray-200'
              }`}
            >
              <p className="text-sm">{message.text}</p>
              {message.type === 'assistant' && !isLiveConversation && (
                <button
                  onClick={() => speakResponse(message.text)}
                  className="mt-2 text-gray-500 hover:text-gray-700"
                  disabled={isSpeaking}
                >
                  {isSpeaking ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="flex items-center space-x-2 bg-white p-2 rounded-lg border border-gray-200">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask about properties..."
          className="flex-1 p-2 outline-none"
          disabled={isLiveConversation}
        />
        {isTextMode && (
          <button
            onClick={toggleVoiceRecognition}
            className={`p-2 rounded-full ${
              isListening ? 'bg-red-500' : 'bg-blue-500'
            } text-white`}
          >
            {isListening ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
        )}
        {!isLiveConversation && (
          <button
            onClick={handleSend}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Send
          </button>
        )}
      </div>

      {/* Live Conversation Status */}
      {isLiveConversation && (
        <div className="text-center mt-4">
          <p className="text-sm text-gray-600">
            {isSpeaking ? 'AI is speaking...' : 'Listening...'}
          </p>
        </div>
      )}
    </div>
  );
};

export default RealEstateAssistant;