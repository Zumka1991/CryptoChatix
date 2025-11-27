using Microsoft.AspNetCore.SignalR;

public class ChatHub : Hub
{
    // Store connected users (userId -> connectionId)
    private static readonly Dictionary<string, string> _connections = new();
    private static readonly object _lock = new();
    private readonly PasswordStorage _passwordStorage;

    public ChatHub(PasswordStorage passwordStorage)
    {
        _passwordStorage = passwordStorage;
    }

    public async Task<bool> Register(string userId, string password)
    {
        // Ensure password is not null
        password = password ?? "";

        // Check if user exists and has a password
        if (_passwordStorage.HasPassword(userId))
        {
            // User has a password set - verify it
            // Empty password is not allowed if user has a password
            if (string.IsNullOrEmpty(password) || !_passwordStorage.VerifyPassword(userId, password))
            {
                return false; // Wrong password or empty password when password is required
            }
        }
        else
        {
            // New user or user without password
            if (!string.IsNullOrEmpty(password))
            {
                _passwordStorage.SetPassword(userId, password);
            }
        }

        lock (_lock)
        {
            _connections[userId] = Context.ConnectionId;
        }

        // Notify other users that someone is online
        var otherUsers = _connections.Keys.Where(k => k != userId).ToList();
        await Clients.Caller.SendAsync("OnlineUsers", otherUsers);

        // Notify all other users about new user
        await Clients.Others.SendAsync("UserOnline", userId);

        return true; // Success
    }

    public async Task<bool> ChangePassword(string newPassword)
    {
        string? userId;
        lock (_lock)
        {
            userId = _connections.FirstOrDefault(x => x.Value == Context.ConnectionId).Key;
        }

        if (userId == null)
        {
            return false;
        }

        _passwordStorage.SetPassword(userId, newPassword);

        await Clients.Caller.SendAsync("SystemMessage", $"Пароль успешно изменен");
        return true;
    }

    public async Task SendEncryptedMessage(string recipientId, string encryptedMessage)
    {
        string? connectionId;
        lock (_lock)
        {
            _connections.TryGetValue(recipientId, out connectionId);
        }

        if (connectionId != null)
        {
            // Get sender userId
            string? senderId;
            lock (_lock)
            {
                senderId = _connections.FirstOrDefault(x => x.Value == Context.ConnectionId).Key;
            }

            if (senderId != null)
            {
                // Forward encrypted message to recipient
                await Clients.Client(connectionId).SendAsync("ReceiveEncryptedMessage", senderId, encryptedMessage);
            }
        }
    }

    public async Task RequestPublicKey(string userId)
    {
        string? connectionId;
        lock (_lock)
        {
            _connections.TryGetValue(userId, out connectionId);
        }

        if (connectionId != null)
        {
            string? requesterId;
            lock (_lock)
            {
                requesterId = _connections.FirstOrDefault(x => x.Value == Context.ConnectionId).Key;
            }

            if (requesterId != null)
            {
                await Clients.Client(connectionId).SendAsync("PublicKeyRequest", requesterId);
            }
        }
    }

    public async Task SendPublicKey(string recipientId, string publicKeyJwk)
    {
        string? connectionId;
        lock (_lock)
        {
            _connections.TryGetValue(recipientId, out connectionId);
        }

        if (connectionId != null)
        {
            string? senderId;
            lock (_lock)
            {
                senderId = _connections.FirstOrDefault(x => x.Value == Context.ConnectionId).Key;
            }

            if (senderId != null)
            {
                await Clients.Client(connectionId).SendAsync("ReceivePublicKey", senderId, publicKeyJwk);
            }
        }
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        string? userId;
        lock (_lock)
        {
            userId = _connections.FirstOrDefault(x => x.Value == Context.ConnectionId).Key;
            if (userId != null)
            {
                _connections.Remove(userId);
            }
        }

        if (userId != null)
        {
            await Clients.Others.SendAsync("UserOffline", userId);
        }

        await base.OnDisconnectedAsync(exception);
    }
}
