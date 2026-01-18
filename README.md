# D&D Character Sheets

A sleek, mobile-friendly web app for tracking D&D 5e characters. Built for friend groups to share character sheets with real-time sync.

## Features

- 📱 **Mobile-first design** - Clean, professional UI optimized for phones
- 🔄 **Real-time sync** - Changes sync instantly across all devices via Supabase
- 👥 **Party view** - See all characters at a glance with HP, AC, Initiative, Passive Perception
- ❤️ **HP tracking** - Quick +/- buttons, temp HP, death saves
- 🎲 **Ability scores & modifiers** - Auto-calculated
- ⭐ **Skills** - Proficiency and expertise tracking with calculated bonuses
- ⚔️ **Actions** - Weapons, spells, and spell slot tracking
- 📦 **Inventory** - Items and currency management
- 📝 **Notes** - Features, traits, backstory, and freeform notes
- ⚠️ **Conditions** - Track active conditions (Poisoned, Stunned, etc.)
- 🔍 **D&D 5e API Integration** - Search and auto-fill spells, weapons, equipment, and features from the official D&D 5e SRD

## Tech Stack

- **Frontend**: Pure HTML, CSS, JavaScript (no build step!)
- **Database**: Supabase (PostgreSQL with real-time subscriptions)
- **Hosting**: GitHub Pages

## Setup

### 1. Create Supabase Database

1. Go to [Supabase](https://supabase.com) and create a new project
2. Go to **SQL Editor**
3. Copy and paste the contents of `supabase-schema.sql`
4. Click **Run**

### 2. Update Supabase Credentials

Edit `app.js` and update the first two lines with your Supabase URL and anon key:

```javascript
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';
```

You can find these in your Supabase project under **Settings** → **API**.

### 3. Deploy to GitHub Pages

1. Create a new GitHub repository
2. Push this code to the repository
3. Go to **Settings** → **Pages**
4. Under "Source", select **Deploy from a branch**
5. Select the `main` branch and `/ (root)` folder
6. Click **Save**

Your site will be live at `https://yourusername.github.io/your-repo-name/`

### Local Development

Just open `index.html` in a browser! No build step required.

For live reload during development, you can use any simple HTTP server:

```bash
# Python
python -m http.server 8000

# Node.js (npx)
npx serve

# PHP
php -S localhost:8000
```

## Usage

### Creating a Character

1. Click the **+** button on the home page
2. Fill in character basics (name, race, class, level)
3. Roll or manually enter ability scores
4. Click **Create Character**

### Managing HP

- Use **−/+** buttons for quick ±1 adjustments
- Enter a specific number and click **Apply** for larger changes
- Set temp HP separately
- Death saves appear automatically when at 0 HP

### Skills & Saves

- **Tap once** → Proficient (filled dot)
- **Tap again** → Expertise (both dots filled)
- **Tap again** → Remove proficiency
- Modifiers auto-calculate

### Conditions

Tap any condition to toggle it active/inactive. Active conditions are highlighted.

### Adding Content with D&D 5e API Search

Use the **Add** buttons to add weapons, spells, items, and features. When adding:

1. Start typing in the name field to search the D&D 5e SRD
2. Click on a search result to auto-fill all fields
3. Modify any values as needed (or enter custom items manually)

The API provides official D&D 5e content including:
- **Weapons** - Attack bonuses and damage auto-calculated based on your character's stats
- **Spells** - Level, school, casting time, range, components, duration, and description
- **Equipment** - Type, weight, cost, and descriptions
- **Features** - Class features with full descriptions

You can also add custom items by simply typing a name and filling in the fields manually.

## File Structure

```
dnd-players/
├── index.html          # Main HTML structure
├── styles.css          # All styling
├── app.js              # Application logic
├── manifest.json       # PWA manifest
├── icon.svg            # App icon
├── supabase-schema.sql # Database schema
└── README.md           # This file
```

## Customization

### Changing Colors

Edit the CSS variables at the top of `styles.css`:

```css
:root {
    --bg-primary: #0a0a0b;
    --accent-primary: #3b82f6;
    /* ... etc */
}
```

### Adding More Conditions

Edit the `CONDITIONS` array in `app.js`:

```javascript
const CONDITIONS = ['Blinded', 'Charmed', /* add more */];
```

## License

MIT - Feel free to use for your own D&D group!
