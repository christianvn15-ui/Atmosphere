/**
 * ATMOSPHERE WEATHER APP - MAXIMUM POTENTIAL
 * Advanced PWA with offline support, background sync, and premium UX
 */

class WeatherApp {
  constructor() {
    this.apiKey = "04b38548faea2f50f453dcd8eb69317c";
    this.deferredPrompt = null;
    this.currentCity = null;
    this.cacheExpiry = 10 * 60 * 1000; // 10 minutes
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.setupOnlineOffline();
    this.setupInstallPrompt();
    this.checkAuthState();
    this.loadHomeCity();
    this.setupKeyboardShortcuts();
  }

  // ==================== EVENT SETUP ====================
  
  setupEventListeners() {
    // Search input with debounce
    const searchInput = document.getElementById("searchlocation");
    let debounceTimer;
    searchInput.addEventListener("input", (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => this.handleSearchInput(e.target.value), 300);
    });
    
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.search();
    });

    // Close popups when clicking outside
    document.addEventListener("click", (e) => {
      const userSection = document.getElementById("user-section");
      const sidebar = document.getElementById("favorites-sidebar");
      
      if (!userSection?.contains(e.target)) {
        document.getElementById("user-popup")?.setAttribute("hidden", "");
      }
    });
  }

  setupKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
      // Press "/" to focus search
      if (e.key === "/" && document.activeElement?.id !== "searchlocation") {
        e.preventDefault();
        document.getElementById("searchlocation")?.focus();
      }
      
      // Press "Escape" to close modals/popups
      if (e.key === "Escape") {
        this.closeModal();
        document.getElementById("user-popup")?.setAttribute("hidden", "");
      }
    });
  }

  setupOnlineOffline() {
    const updateOnlineStatus = () => {
      const offlineBar = document.getElementById("offline-bar");
      if (!navigator.onLine) {
        offlineBar.removeAttribute("hidden");
        offlineBar.classList.add("visible");
        this.showToast("You're offline. Using cached data.", "warning");
      } else {
        offlineBar.setAttribute("hidden", "");
        offlineBar.classList.remove("visible");
        this.showToast("Back online!", "success");
      }
    };

    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    updateOnlineStatus();
  }

  setupInstallPrompt() {
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      const installBtn = document.getElementById("installBtn");
      if (installBtn) {
        installBtn.style.display = "flex";
        installBtn.onclick = async () => {
          installBtn.style.display = "none";
          this.deferredPrompt.prompt();
          const { outcome } = await this.deferredPrompt.userChoice;
          if (outcome === "accepted") {
            this.showToast("App installed successfully!", "success");
          }
          this.deferredPrompt = null;
        };
      }
    });
  }

  // ==================== API & DATA ====================

  async fetchWithCache(url, cacheKey, expiry = this.cacheExpiry) {
    // Check cache first
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < expiry) {
        return data;
      }
    }

    // Fetch fresh data
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      
      // Cache the result
      localStorage.setItem(cacheKey, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
      
      return data;
    } catch (error) {
      // Return cached data even if expired as fallback
      if (cached) {
        const { data } = JSON.parse(cached);
        this.showToast("Using cached data", "warning");
        return data;
      }
      throw error;
    }
  }

  async getCurrentLocation() {
    if (!navigator.geolocation) {
      this.showToast("Geolocation not supported", "error");
      return;
    }

    this.showToast("Getting your location...", "info");
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const data = await this.fetchWithCache(
            `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${this.apiKey}&units=metric`,
            `weather_loc_${latitude}_${longitude}`
          );
          await this.loadWeather(data.name);
          this.showToast(`Found: ${data.name}`, "success");
        } catch (err) {
          this.showToast("Could not get weather for location", "error");
        }
      },
      (err) => {
        this.showToast("Location access denied", "error");
      }
    );
  }

  // ==================== UI RENDERING ====================

  async loadWeather(city) {
    const container = document.getElementById("weather-container");
    this.currentCity = city;
    
    // Show skeleton loading
    container.innerHTML = this.getSkeletonHTML();

    try {
      // Fetch current weather and forecast in parallel
      const [weatherData, forecastData] = await Promise.all([
        this.fetchWithCache(
          `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${this.apiKey}&units=metric`,
          `weather_${city}`
        ),
        this.fetchWithCache(
          `https://api.openweathermap.org/data/2.5/forecast?q=${city}&appid=${this.apiKey}&units=metric`,
          `forecast_${city}`
        )
      ]);

      this.updateTheme(weatherData.weather[0].main);
      container.innerHTML = this.renderWeatherCard(weatherData);
      container.innerHTML += this.renderForecast(forecastData);
      
      // Update favorites list with current temps
      this.updateFavoritesList();
      
    } catch (err) {
      console.error("Weather load error:", err);
      container.innerHTML = `
        <div class="weather-card error-state">
          <h3>Unable to load weather</h3>
          <p>${err.message || "Please check your connection and try again."}</p>
          <button class="city-button" onclick="window.app.loadWeather('${city}')">Retry</button>
        </div>
      `;
      this.showToast("Failed to load weather data", "error");
    }
  }

  renderWeatherCard(data) {
    const icon = `https://openweathermap.org/img/wn/${data.weather[0].icon}@4x.png`;
    const date = new Date().toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    return `
      <div class="weather-card">
        <div class="weather-header">
          <div class="location-title">
            <h2>${data.name}</h2>
            <span class="country">${data.sys.country}</span>
            <p style="color: #64748b; margin-top: 4px;">${date}</p>
          </div>
          <div class="weather-main">
            <img src="${icon}" alt="${data.weather[0].description}" class="weather-icon-lg">
            <div class="temp-display">
              <div class="temp-value">${Math.round(data.main.temp)}°</div>
              <div class="temp-desc">${data.weather[0].main}</div>
            </div>
          </div>
        </div>
        
        <div class="weather-details">
          <div class="detail-item">
            <div class="detail-icon">🌡️</div>
            <div class="detail-value">${Math.round(data.main.feels_like)}°</div>
            <div class="detail-label">Feels Like</div>
          </div>
          <div class="detail-item">
            <div class="detail-icon">💧</div>
            <div class="detail-value">${data.main.humidity}%</div>
            <div class="detail-label">Humidity</div>
          </div>
          <div class="detail-item">
            <div class="detail-icon">💨</div>
            <div class="detail-value">${data.wind.speed} m/s</div>
            <div class="detail-label">Wind</div>
          </div>
          <div class="detail-item">
            <div class="detail-icon">👁️</div>
            <div class="detail-value">${(data.visibility / 1000).toFixed(1)} km</div>
            <div class="detail-label">Visibility</div>
          </div>
          <div class="detail-item">
            <div class="detail-icon">🔽</div>
            <div class="detail-value">${data.main.pressure} hPa</div>
            <div class="detail-label">Pressure</div>
          </div>
          <div class="detail-item" onclick="window.app.showSunTimes(${data.sys.sunrise}, ${data.sys.sunset})" style="cursor: pointer;">
            <div class="detail-icon">🌅</div>
            <div class="detail-value">${new Date(data.sys.sunrise * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
            <div class="detail-label">Sunrise (click)</div>
          </div>
        </div>

        <div class="action-buttons">
          <button class="city-button" onclick="window.app.setHomeCity('${data.name}')">
            🏠 Set as Home
          </button>
          <button class="city-button" onclick="window.app.addFavorite('${data.name}')">
            ⭐ Add to Favorites
          </button>
        </div>
      </div>
    `;
  }

  renderForecast(data) {
    const hourly = data.list.slice(0, 8);
    const daily = data.list.filter((_, i) => i % 8 === 0).slice(0, 5);

    return `
      <div class="forecast-section">
        <div class="forecast-header">
          <h3>Hourly Forecast</h3>
        </div>
        <div class="forecast-scroll">
          ${hourly.map(hour => {
            const time = new Date(hour.dt_txt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const icon = `https://openweathermap.org/img/wn/${hour.weather[0].icon}.png`;
            return `
              <div class="forecast-item" title="${hour.weather[0].description}">
                <span class="time">${time}</span>
                <img src="${icon}" alt="${hour.weather[0].description}">
                <span class="temp">${Math.round(hour.main.temp)}°</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <div class="forecast-section">
        <div class="forecast-header">
          <h3>5-Day Forecast</h3>
        </div>
        <div class="daily-list">
          ${daily.map(day => {
            const date = new Date(day.dt_txt);
            const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
            const fullDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const icon = `https://openweathermap.org/img/wn/${day.weather[0].icon}.png`;
            return `
              <div class="daily-item" onclick="window.app.showDayDetails('${day.dt_txt}')">
                <div>
                  <div class="day">${dayName}</div>
                  <div style="font-size: 0.8rem; color: #64748b;">${fullDate}</div>
                </div>
                <div class="condition">
                  <img src="${icon}" alt="${day.weather[0].description}">
                  <span>${day.weather[0].main}</span>
                </div>
                <div class="temps">
                  <span class="high">${Math.round(day.main.temp_max)}°</span>
                  <span class="low">${Math.round(day.main.temp_min)}°</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  getSkeletonHTML() {
    return `
      <div class="weather-card">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <div class="skeleton" style="height: 32px; width: 200px; margin-bottom: 8px;"></div>
            <div class="skeleton" style="height: 16px; width: 100px;"></div>
          </div>
          <div class="skeleton" style="height: 80px; width: 80px; border-radius: 50%;"></div>
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 24px;">
          ${Array(6).fill('<div class="skeleton" style="height: 80px; border-radius: 12px;"></div>').join('')}
        </div>
      </div>
    `;
  }

  // ==================== THEME & STYLING ====================

  updateTheme(weatherCondition) {
    const root = document.documentElement;
    const condition = weatherCondition.toLowerCase();
    
    let hue = 220; // Default blue
    
    if (condition.includes('clear') || condition.includes('sun')) hue = 45; // Orange
    else if (condition.includes('cloud')) hue = 200; // Gray-blue
    else if (condition.includes('rain') || condition.includes('drizzle')) hue = 210; // Blue
    else if (condition.includes('snow')) hue = 190; // Cyan
    else if (condition.includes('thunder')) hue = 270; // Purple
    else if (condition.includes('mist') || condition.includes('fog')) hue = 180; // Teal
    
    root.style.setProperty('--primary-hue', hue);
  }

  // ==================== USER MANAGEMENT ====================

  checkAuthState() {
    const isSignedIn = localStorage.getItem("signedIn") === "true";
    const user = JSON.parse(localStorage.getItem("weatherUser") || "{}");
    
    const signupBtn = document.getElementById("signupBtn");
    const userBadge = document.getElementById("user-badge");
    const userInitial = document.getElementById("user-initial");
    
    if (isSignedIn && user.name) {
      if (signupBtn) signupBtn.style.display = "none";
      if (userBadge) {
        userBadge.style.display = "flex";
        userInitial.textContent = user.name.charAt(0).toUpperCase();
      }
      this.updateUserPopup(user);
    } else {
      if (userBadge) userBadge.style.display = "none";
    }
  }

  updateUserPopup(user) {
    const popupName = document.getElementById("popup-name");
    const popupEmail = document.getElementById("popup-email");
    if (popupName) popupName.textContent = `${user.name} ${user.surname}`;
    if (popupEmail) popupEmail.textContent = user.email;
  }

  toggleUserMenu() {
    const popup = document.getElementById("user-popup");
    const isHidden = popup.hasAttribute("hidden");
    
    if (isHidden) {
      popup.removeAttribute("hidden");
      this.renderFavorites();
    } else {
      popup.setAttribute("hidden", "");
    }
  }

  // ==================== FAVORITES ====================

  async addFavorite(city) {
    const user = JSON.parse(localStorage.getItem("weatherUser"));
    if (!user) {
      this.showToast("Please sign in to save favorites", "error");
      setTimeout(() => this.goToSignup(), 1500);
      return;
    }

    if (!user.favorites) user.favorites = [];
    
    if (user.favorites.includes(city)) {
      this.showToast(`${city} is already in favorites`, "warning");
      return;
    }

    user.favorites.push(city);
    this.saveUser(user);
    this.showToast(`${city} added to favorites!`, "success");
    this.renderFavorites();
  }

  async removeFavorite(city, event) {
    event.stopPropagation();
    const user = JSON.parse(localStorage.getItem("weatherUser"));
    if (!user?.favorites) return;
    
    user.favorites = user.favorites.filter(f => f !== city);
    this.saveUser(user);
    this.renderFavorites();
    this.showToast(`${city} removed from favorites`, "info");
  }

  saveUser(user) {
    localStorage.setItem("weatherUser", JSON.stringify(user));
    let users = JSON.parse(localStorage.getItem("weatherUsers")) || [];
    const idx = users.findIndex(u => u.email === user.email);
    if (idx >= 0) {
      users[idx] = user;
      localStorage.setItem("weatherUsers", JSON.stringify(users));
    }
  }

  renderFavorites() {
    const list = document.getElementById("favorites-list");
    const user = JSON.parse(localStorage.getItem("weatherUser")) || {};
    const favorites = user.favorites || [];
    
    if (!list) return;
    
    if (favorites.length === 0) {
      list.innerHTML = '<p style="color: #64748b; text-align: center; padding: 20px;">No favorites yet</p>';
      return;
    }

    list.innerHTML = favorites.map(city => `
      <div class="favorite-city" onclick="window.app.loadWeather('${city}')">
        <span>${city}</span>
        <button class="remove-fav" onclick="window.app.removeFavorite('${city}', event)" title="Remove">×</button>
      </div>
    `).join('');
  }

  async updateFavoritesList() {
    // This would fetch current temps for all favorites
    // For now, just re-render
    this.renderFavorites();
  }

  showFavorites() {
    const sidebar = document.getElementById("favorites-sidebar");
    sidebar.classList.remove("hidden");
    document.getElementById("user-popup")?.setAttribute("hidden", "");
  }

  toggleSidebar() {
    document.getElementById("favorites-sidebar").classList.toggle("hidden");
  }

  // ==================== HOME CITY ====================

  setHomeCity(city) {
    const user = JSON.parse(localStorage.getItem("weatherUser"));
    if (!user) {
      this.showToast("Please sign in to set home city", "error");
      return;
    }
    
    user.homeCity = city;
    this.saveUser(user);
    this.showToast(`${city} set as home city!`, "success");
  }

  loadHomeCity() {
    const user = JSON.parse(localStorage.getItem("weatherUser"));
    if (user?.homeCity) {
      this.loadWeather(user.homeCity);
    } else {
      this.loadWeather("London"); // Default
    }
  }

  // ==================== SEARCH ====================

  async handleSearchInput(value) {
    const suggestions = document.getElementById("search-suggestions");
    if (value.length < 2) {
      suggestions.setAttribute("hidden", "");
      return;
    }

    // Simple suggestion logic - in production, use a city API
    const commonCities = ["London", "New York", "Tokyo", "Paris", "Sydney", "Berlin", "Moscow", "Dubai", "Singapore", "Barcelona"];
    const matches = commonCities.filter(c => c.toLowerCase().includes(value.toLowerCase()));
    
    if (matches.length > 0) {
      suggestions.innerHTML = matches.map(city => `
        <div class="suggestion-item" onclick="window.app.selectSuggestion('${city}')">${city}</div>
      `).join('');
      suggestions.removeAttribute("hidden");
    } else {
      suggestions.setAttribute("hidden", "");
    }
  }

  selectSuggestion(city) {
    document.getElementById("searchlocation").value = city;
    document.getElementById("search-suggestions").setAttribute("hidden", "");
    this.search();
  }

  search() {
    const location = document.getElementById("searchlocation").value.trim();
    if (location) {
      this.loadWeather(location);
      document.getElementById("search-suggestions")?.setAttribute("hidden", "");
    }
  }

  // ==================== MODAL & DETAILS ====================

  showSunTimes(sunrise, sunset) {
    const sunriseTime = new Date(sunrise * 1000).toLocaleTimeString();
    const sunsetTime = new Date(sunset * 1000).toLocaleTimeString();
    
    this.showModal("Sun Times", `
      <div style="display: grid; gap: 16px; text-align: center;">
        <div style="padding: 20px; background: rgba(30, 41, 59, 0.6); border-radius: 12px;">
          <div style="font-size: 2rem; margin-bottom: 8px;">🌅</div>
          <div style="font-size: 1.5rem; font-weight: 600;">${sunriseTime}</div>
          <div style="color: #64748b;">Sunrise</div>
        </div>
        <div style="padding: 20px; background: rgba(30, 41, 59, 0.6); border-radius: 12px;">
          <div style="font-size: 2rem; margin-bottom: 8px;">🌇</div>
          <div style="font-size: 1.5rem; font-weight: 600;">${sunsetTime}</div>
          <div style="color: #64748b;">Sunset</div>
        </div>
      </div>
    `);
  }

  showDayDetails(dateStr) {
    this.showModal("Day Details", `<p>Detailed forecast for ${dateStr} would appear here...</p>`);
  }

  showModal(title, content) {
    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal-content").innerHTML = content;
    document.getElementById("modal-overlay").classList.add("active");
  }

  closeModal(event) {
    if (!event || event.target === document.getElementById("modal-overlay")) {
      document.getElementById("modal-overlay").classList.remove("active");
    }
  }

  // ==================== NOTIFICATIONS ====================

  showToast(message, type = "info", duration = 3000) {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(100%)";
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  async toggleNotifications() {
    if (!("Notification" in window)) {
      this.showToast("Notifications not supported", "error");
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      this.showToast("Notifications enabled!", "success");
      // Subscribe to push notifications
      this.subscribeToPush();
    } else {
      this.showToast("Notifications denied", "warning");
    }
  }

  async subscribeToPush() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array("BAVPjCJWfMxuM4aqLPHU87J_bWGLSEfeHkqLLIoHq__KB4cwxT8BCbzOnzrbDXTJcDc1lKqv0YXcK6fmUPVQdO8")
      });
      
      // Send to your backend
      console.log("Push subscription:", subscription);
    } catch (err) {
      console.error("Push subscription failed:", err);
    }
  }

  urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
  }

  // ==================== NAVIGATION ====================

  retryConnection() {
    if (navigator.onLine) {
      if (this.currentCity) {
        this.loadWeather(this.currentCity);
      } else {
        this.loadHomeCity();
      }
      this.showToast("Connection restored!", "success");
    } else {
      this.showToast("Still offline", "warning");
    }
  }

  goToSignup() {
    window.location.href = "signup.html";
  }

  goToSignin() {
    window.location.href = "signin.html";
  }

  signout() {
    localStorage.removeItem("signedIn");
    localStorage.removeItem("weatherUser");
    this.showToast("Signed out successfully", "success");
    setTimeout(() => window.location.reload(), 1000);
  }
}

// Initialize app
window.app = new WeatherApp();
