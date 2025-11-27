var builder = WebApplication.CreateBuilder(args);

// Add CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        if (builder.Environment.IsDevelopment())
        {
            // Development: allow localhost origins
            policy.WithOrigins("http://localhost:3000", "http://localhost:5173")
                  .AllowAnyHeader()
                  .AllowAnyMethod()
                  .AllowCredentials();
        }
        else
        {
            // Production: allow any origin with credentials (needed for SignalR)
            policy.SetIsOriginAllowed(_ => true)
                  .AllowAnyHeader()
                  .AllowAnyMethod()
                  .AllowCredentials();
        }
    });
});

// Add SignalR
builder.Services.AddSignalR();

// Add PasswordStorage as singleton
builder.Services.AddSingleton<PasswordStorage>();

var app = builder.Build();

// Serve static files for production (before CORS and routing)
if (app.Environment.IsProduction())
{
    app.UseDefaultFiles();
    app.UseStaticFiles();
}

// Use CORS (needed for WebSocket connections)
app.UseCors("AllowFrontend");

// Map SignalR hub
app.MapHub<ChatHub>("/chatHub");

app.Run();
