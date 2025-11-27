import { useState, useEffect, useRef } from 'react'
import * as signalR from '@microsoft/signalr'
import { CryptoManager } from './crypto'

function App() {
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [onlineUsers, setOnlineUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [messages, setMessages] = useState({}) // userId -> [{from, text, time}]
  const [inputMessage, setInputMessage] = useState('')
  const [showSidebar, setShowSidebar] = useState(true)
  const [systemMessages, setSystemMessages] = useState([])

  const connectionRef = useRef(null)
  const cryptoRef = useRef(new CryptoManager())
  const messagesEndRef = useRef(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, selectedUser])

  useEffect(() => {
    return () => {
      if (connectionRef.current) {
        connectionRef.current.stop()
      }
    }
  }, [])

  const connect = async () => {
    if (!userId.trim()) {
      alert('Введите имя пользователя')
      return
    }

    try {
      // Generate key pair
      await cryptoRef.current.generateKeyPair()

      // Create SignalR connection
      // Use relative URL in production, localhost in development
      const hubUrl = import.meta.env.DEV
        ? 'http://localhost:5000/chatHub'
        : '/chatHub'

      const connection = new signalR.HubConnectionBuilder()
        .withUrl(hubUrl)
        .withAutomaticReconnect()
        .build()

      // Handle online users list
      connection.on('OnlineUsers', (users) => {
        setOnlineUsers(users)
        // Request public keys from all online users
        users.forEach(user => {
          connection.invoke('RequestPublicKey', user)
        })
      })

      // Handle user coming online
      connection.on('UserOnline', (user) => {
        setOnlineUsers(prev => [...prev, user])
        // Request their public key
        connection.invoke('RequestPublicKey', user)
      })

      // Handle user going offline
      connection.on('UserOffline', (user) => {
        setOnlineUsers(prev => prev.filter(u => u !== user))
      })

      // Handle public key request
      connection.on('PublicKeyRequest', async (requesterId) => {
        const publicKeyJwk = await cryptoRef.current.exportPublicKey()
        await connection.invoke('SendPublicKey', requesterId, publicKeyJwk)
      })

      // Handle receiving public key
      connection.on('ReceivePublicKey', async (senderId, publicKeyJwk) => {
        await cryptoRef.current.importPeerPublicKey(senderId, publicKeyJwk)
      })

      // Handle receiving encrypted message
      connection.on('ReceiveEncryptedMessage', async (senderId, encryptedMessage) => {
        try {
          const decryptedText = await cryptoRef.current.decryptMessage(encryptedMessage)

          setMessages(prev => ({
            ...prev,
            [senderId]: [
              ...(prev[senderId] || []),
              {
                from: senderId,
                text: decryptedText,
                time: new Date().toLocaleTimeString()
              }
            ]
          }))
        } catch (error) {
          console.error('Failed to decrypt message:', error)
        }
      })

      // Handle system messages
      connection.on('SystemMessage', (message) => {
        setSystemMessages(prev => [...prev, { text: message, time: new Date().toLocaleTimeString() }])
        setTimeout(() => {
          setSystemMessages(prev => prev.slice(1))
        }, 3000)
      })

      await connection.start()
      const success = await connection.invoke('Register', userId, password)

      if (!success) {
        alert('Неверный пароль!')
        await connection.stop()
        return
      }

      connectionRef.current = connection
      setIsConnected(true)
    } catch (error) {
      console.error('Connection failed:', error)
      alert('Не удалось подключиться к серверу')
    }
  }

  const sendMessage = async () => {
    if (!inputMessage.trim()) return

    // Check for /pwd command
    if (inputMessage.startsWith('/pwd ')) {
      const newPassword = inputMessage.substring(5).trim()

      if (!newPassword) {
        alert('Использование: /pwd НовыйПароль')
        return
      }

      try {
        const success = await connectionRef.current.invoke('ChangePassword', newPassword)
        if (success) {
          setPassword(newPassword)
          alert('Пароль успешно изменен!')
        } else {
          alert('Не удалось изменить пароль')
        }
      } catch (error) {
        console.error('Failed to change password:', error)
        alert('Ошибка при изменении пароля')
      }

      setInputMessage('')
      return
    }

    if (!selectedUser) return

    try {
      // Encrypt message
      const encryptedMessage = await cryptoRef.current.encryptMessage(
        selectedUser,
        inputMessage
      )

      // Send encrypted message
      await connectionRef.current.invoke(
        'SendEncryptedMessage',
        selectedUser,
        encryptedMessage
      )

      // Add to local messages
      setMessages(prev => ({
        ...prev,
        [selectedUser]: [
          ...(prev[selectedUser] || []),
          {
            from: userId,
            text: inputMessage,
            time: new Date().toLocaleTimeString()
          }
        ]
      }))

      setInputMessage('')
    } catch (error) {
      console.error('Failed to send message:', error)
      alert('Не удалось отправить сообщение. Убедитесь, что у вас есть публичный ключ получателя.')
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  if (!isConnected) {
    return (
      <div className="login-screen">
        <div className="login-box">
          <h1>CryptoChatix</h1>
          <p className="subtitle">Сквозное шифрование (E2E)</p>
          <input
            type="text"
            placeholder="Введите ваше имя"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            autoFocus
          />
          <input
            type="password"
            placeholder="Пароль (опционально)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && connect()}
          />
          <p className="hint">По умолчанию пароль отсутствует. Используйте /pwd для установки пароля в чате.</p>
          <button onClick={connect}>Подключиться</button>
        </div>
      </div>
    )
  }

  const currentMessages = selectedUser ? messages[selectedUser] || [] : []

  const selectUser = (user) => {
    setSelectedUser(user)
    setShowSidebar(false) // Hide sidebar on mobile when user is selected
  }

  return (
    <div className="chat-container">
      <div className={`sidebar ${showSidebar ? 'show' : ''}`}>
        <div className="sidebar-header">
          <h3>{userId}</h3>
          <span className="online-indicator"></span>
        </div>
        <div className="users-list">
          <h4>Онлайн ({onlineUsers.length})</h4>
          {onlineUsers.length === 0 ? (
            <p className="no-users">Нет других пользователей</p>
          ) : (
            onlineUsers.map(user => (
              <div
                key={user}
                className={`user-item ${selectedUser === user ? 'active' : ''}`}
                onClick={() => selectUser(user)}
              >
                <span className="user-avatar">{user[0].toUpperCase()}</span>
                <span className="user-name">{user}</span>
                {messages[user]?.length > 0 && (
                  <span className="message-count">{messages[user].length}</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="chat-area">
        {selectedUser ? (
          <>
            <div className="chat-header">
              <button
                className="back-button"
                onClick={() => setShowSidebar(true)}
              >
                ←
              </button>
              <h3>{selectedUser}</h3>
              <span className="encryption-badge">🔒 E2E Encrypted</span>
            </div>
            <div className="messages-container">
              {currentMessages.length === 0 ? (
                <p className="no-messages">Начните разговор</p>
              ) : (
                <>
                  {currentMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`message ${msg.from === userId ? 'sent' : 'received'}`}
                    >
                      <div className="message-content">
                        <p>{msg.text}</p>
                        <span className="message-time">{msg.time}</span>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>
            <div className="input-area">
              <input
                type="text"
                placeholder="Введите сообщение..."
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
              />
              <button onClick={sendMessage}>Отправить</button>
            </div>
          </>
        ) : (
          <div className="no-chat-selected">
            <p>Выберите пользователя для начала чата</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
