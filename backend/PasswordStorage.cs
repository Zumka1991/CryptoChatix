using System.Text.Json;

public class PasswordStorage
{
    private readonly string _filePath;
    private readonly Dictionary<string, string> _passwords;
    private readonly object _lock = new();

    public PasswordStorage(IWebHostEnvironment? environment = null)
    {
        // In production (Docker), use /app/passwords directory
        // In development, use current directory
        var baseDir = environment?.IsProduction() == true
            ? "/app/passwords"
            : ".";

        // Ensure directory exists
        if (!Directory.Exists(baseDir))
        {
            Directory.CreateDirectory(baseDir);
        }

        _filePath = Path.Combine(baseDir, "passwords.json");
        _passwords = LoadPasswords();
    }

    private Dictionary<string, string> LoadPasswords()
    {
        try
        {
            if (File.Exists(_filePath))
            {
                var json = File.ReadAllText(_filePath);
                return JsonSerializer.Deserialize<Dictionary<string, string>>(json)
                       ?? new Dictionary<string, string>();
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error loading passwords: {ex.Message}");
        }

        return new Dictionary<string, string>();
    }

    private void SavePasswords()
    {
        try
        {
            var json = JsonSerializer.Serialize(_passwords, new JsonSerializerOptions
            {
                WriteIndented = true
            });
            File.WriteAllText(_filePath, json);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error saving passwords: {ex.Message}");
        }
    }

    public bool HasPassword(string userId)
    {
        lock (_lock)
        {
            return _passwords.ContainsKey(userId);
        }
    }

    public bool VerifyPassword(string userId, string password)
    {
        lock (_lock)
        {
            return _passwords.TryGetValue(userId, out var storedPassword)
                   && storedPassword == password;
        }
    }

    public void SetPassword(string userId, string password)
    {
        lock (_lock)
        {
            _passwords[userId] = password;
            SavePasswords();
        }
    }

    public void RemovePassword(string userId)
    {
        lock (_lock)
        {
            if (_passwords.Remove(userId))
            {
                SavePasswords();
            }
        }
    }
}
