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
            // Production: allow any origin (frontend served from same origin)
            policy.AllowAnyOrigin()
                  .AllowAnyHeader()
                  .AllowAnyMethod();
        }
    });
});

// Add SignalR
builder.Services.AddSignalR();

// Add PasswordStorage as singleton
builder.Services.AddSingleton<PasswordStorage>();

var app = builder.Build();

// Use CORS in development
if (app.Environment.IsDevelopment())
{
    app.UseCors("AllowFrontend");
}

// Map SignalR hub
app.MapHub<ChatHub>("/chatHub");

// Serve static files for production
if (app.Environment.IsProduction())
{
    app.UseDefaultFiles();
    app.UseStaticFiles();
}

app.Run();
