const BlackjackPage = ({ socket, setBalance }) => {
  const { user } = useAuth();
  const [gameState, setGameState] = useState('waiting'); // waiting, betting, in_progress, completed
  const [betAmount, setBetAmount] = useState(100);
  const [balance, setLocalBalance] = useState(user?.balance || 0);
  const [message, setMessage] = useState('');
  const [playerHand, setPlayerHand] = useState([]);
  const [dealerHand, setDealerHand] = useState([]);
  const [currentGame, setCurrentGame] = useState(null);
  const [playerValue, setPlayerValue] = useState(0);
  const [dealerValue, setDealerValue] = useState(0);
  const [result, setResult] = useState('');

  // Update local balance when user balance changes
  useEffect(() => {
    if (user) {
      setLocalBalance(user.balance);
    }
  }, [user]);

  // Calculate hand value - this function was previously declared twice, so we keep only one instance
  const calculateHandValue = (hand) => {
    if (!hand) return 0;
    
    let value = 0;
    let aces = 0;
    
    for (const card of hand) {
      if (card.rank === 'A') {
        aces++;
        value += 11;
      } else if (['J', 'Q', 'K'].includes(card.rank)) {
        value += 10;
      } else {
        value += parseInt(card.rank);
      }
    }
    
    // Adjust for aces if value is over 21
    while (value > 21 && aces > 0) {
      value -= 10; // Convert ace from 11 to 1
      aces--;
    }
    
    return value;
  };

  const startGame = async () => {
    if (betAmount > balance) {
      setMessage('Insufficient balance');
      return;
    }

    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/blackjack/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ betAmount })
      });

      const data = await response.json();

      if (response.ok) {
        setGameState('in_progress');
        setCurrentGame(data.gameId || null);
        
        // Set initial hands and values
        if (data.playerHand) setPlayerHand(data.playerHand);
        if (data.dealerHand) setDealerHand(data.dealerHand);
        
        // Calculate and set values
        const playerValue = calculateHandValue(data.playerHand);
        const dealerValue = calculateHandValue(data.dealerHand);
        setPlayerValue(playerValue);
        
        setMessage('');
        
        // Update balance
        setLocalBalance(prev => prev - betAmount);
      } else {
        setMessage(data.message || 'Error starting game');
      }
    } catch (error) {
      console.error('Error starting blackjack game:', error);
      setMessage('Error starting game');
    }
  };

  const hit = async () => {
    if (!currentGame) {
      setMessage('No active game');
      return;
    }

    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/blackjack/${currentGame?.gameId || 'test'}/hit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        if (data.playerHand) setPlayerHand(data.playerHand);
        const playerValue = calculateHandValue(data.playerHand);
        setPlayerValue(playerValue);
        
        if (data.status === 'completed') {
          setGameState('completed');
          setResult(data.result || 'win');
          
          if (data.dealerHand) setDealerHand(data.dealerHand);
          const dealerValue = calculateHandValue(data.dealerHand);
          setDealerValue(dealerValue);
          
          // Update balance based on result
          if (data.result === 'win') {
            setLocalBalance(prev => prev + betAmount * 2);
          } else if (data.result === 'lose') {
            setLocalBalance(prev => prev - betAmount);
          } else if (data.result === 'push') {
            setLocalBalance(prev => prev + betAmount);
          }
        }
      } else {
        setMessage(data.message || 'Error hitting');
      }
    } catch (error) {
      console.error('Error hitting:', error);
      setMessage('Error hitting');
    }
  };

  const stand = async () => {
    if (!currentGame) {
      setMessage('No active game');
      return;
    }

    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/blackjack/${currentGame?.gameId || 'test'}/stand`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        setGameState('completed');
        setResult(data.result || 'win');
        
        if (data.dealerHand) setDealerHand(data.dealerHand);
        const dealerValue = calculateHandValue(data.dealerHand);
        setDealerValue(dealerValue);
        
        // Update balance based on result
        if (data.result === 'win') {
          setLocalBalance(prev => prev + betAmount * 2);
        } else if (data.result === 'lose') {
          setLocalBalance(prev => prev - betAmount);
        } else if (data.result === 'push') {
          setLocalBalance(prev => prev + betAmount);
        }
      } else {
        setMessage(data.message || 'Error standing');
      }
    } catch (error) {
      console.error('Error standing:', error);
      setMessage('Error standing');
    }
  };
