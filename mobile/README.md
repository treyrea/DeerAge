# DeerAge – AI Deer Age & Rack Estimator

**Tagline:** *Know before you pull the trigger.*
**Powered by:** RackScore™ AI

A sophisticated mobile hunting companion that provides fast, trustworthy guidance for hunters both before and after the shot. DeerAge combines advanced AI analysis with official Boone & Crockett scoring to give you data-backed decisions in the field.

## Purpose

Give hunters fast, trustworthy guidance before they shoot and data-backed bragging rights afterward.

## Core Concept

DeerAge provides three distinct modes that mirror a real hunting experience:

### 0. **Quick Check** – Instant SHOOT / LET WALK Decision (~1-2 seconds)
The fastest path to a shoot/no-shoot decision when you're in the blind and seconds matter.

**Image Validation:**
Quick Check automatically validates images before analysis:
- Detects **head mounts/taxidermy** - Returns clear message that mounted heads cannot be aged
- Detects **non-deer objects** - Identifies when the image is not a deer
- Detects **missing body** - Requires full body visibility (head-only rejected)
- Detects **poor quality** - Rejects images too blurry or dark for analysis

**TPWD-Compliant Body-Based Analysis:**
Quick Check now uses exactly 3 high-signal body features as defined by TPWD wildlife biologists:
1. **Neck-to-Brisket Integration** - Evaluates whether neck flows into chest with no visible pinch point
2. **Chest Depth vs Hindquarters** - Front chest deeper/heavier than rear = mature indicator
3. **Leg-to-Body Proportion** - Legs appear short due to deep torso = older age class

**How It Works:**
- Single tap capture from Home screen
- **Image validation first** - Rejects head mounts, non-deer, or unsuitable images with clear feedback
- Body-only analysis using EXACTLY 3 TPWD-compliant features (no antler analysis)
- Returns binary SHOOT or LET WALK result with age CLASS estimate (not exact age)
- Decision requires 2 of 3 features to indicate "mature" or "post-mature"
- Full-screen color-coded result (green = SHOOT, red = LET WALK, amber = Invalid Image)
- Warden-safe explanation using proportional body characteristics language
- Option to run full detailed 7-feature analysis afterward if time permits

**Optimizations for Speed:**
- Smaller image compression (768px vs 1024px)
- Low detail vision mode
- Minimal token response (~100-200 tokens)
- 15 second timeout (typically completes in 1-2 seconds)

**Output:**
- Big SHOOT or LET WALK badge with haptic feedback
- **Invalid Image Screen** (amber) if head mount, non-deer, or unsuitable image detected with:
  - Clear reason for rejection (HEAD MOUNT DETECTED, NOT A DEER, BODY NOT VISIBLE, POOR IMAGE QUALITY)
  - Tips for taking a proper photo
  - "Try Another Photo" button
- Estimated age CLASS (1.5-2.5, 2.5-3.5, 3.5-4.5, 4.5-5.5, or 5.5+ years) - NOT exact age
- Confidence percentage
- Warden-safe explanation using ONLY body characteristics
- Key feature that drove the decision (neck-brisket, chest-hindquarter, or leg-body)
- TPWD disclaimer: "Age estimates are based on proportional body characteristics and represent age classes, not exact age."
- "Get Full Age Analysis" button for comprehensive 7-feature assessment

### 1. **Age My Deer** – Pre-Shot Decision Support (TPWD-Compliant Explainable AI)
Used in the blind before the shot to quickly estimate age and shooter eligibility with full transparency and warden-defensible explanations.

**Two-Layer Reasoning Model:**
The app implements a sophisticated two-layer analysis system:
- **Layer 1 (Internal)**: Probabilistic age estimation using AI to assign probability percentages across age classes
- **Layer 2 (External)**: Warden-safe decision & explanation using ONLY proportional body characteristics

**TPWD-Compliant 7-Feature Analysis:**
The comprehensive mode analyzes exactly 7 body features:

*PRIMARY FEATURES (4) - High Weight, Must Agree for SHOOT:*
1. **Neck-to-Brisket Integration** - Neck flows into chest with no visible pinch point = mature
2. **Chest Depth vs Hindquarters** - Front chest deeper/heavier than rear = mature class
3. **Overall Body Depth** - Rib cage height (NOT fat sag) = structural maturity indicator
4. **Leg-to-Body Proportion** - Legs appear short due to deep torso = older age class (MOST RELIABLE)

*SECONDARY FEATURES (3) - Supporting Evidence:*
5. **Backline Posture** - Swayed back = older (rut-adjusted)
6. **Belly/Waist Line** - Pot belly vs tucked waist (HEAVILY rut-adjusted)
7. **Head-to-Body Ratio** - Head proportional to massive body = mature

**Age-Floor Decision Logic:**
- Configurable MLD minimum shoot age (default 3.5 years)
- Decision requires: Cumulative probability ≥65% AND 3 of 4 primary features indicating "mature"
- When uncertain → defaults to LET WALK (protects management goals)

**Regional & Rut Adjustments:**
- Toggle rut season in Settings to down-weight belly/backline, up-weight chest and leg proportion
- All evaluations normalized to relative proportions, not absolute size
- Regional body size variations accounted for

**Warden-Safe Explanation Template:**
All explanations follow this TPWD-approved format:
> "The harvest decision was based on proportional body characteristics consistent with deer at or above [minimum age] years, including neck-to-brisket integration, chest depth exceeding hindquarters, deep rib cage causing shortened leg appearance, and overall front-end dominance. Secondary features supported the conclusion, accounting for rut-related weight changes and regional norms. Age estimates represent age classes, not exact age."

**Required Disclaimer (Always Displayed):**
> "Age estimates are based on proportional body characteristics and represent age classes, not exact age."

**Explainable AI Features:**
- **Image Quality Validation**: Automatically detects unsuitable images (head-only, mounted deer, excessive occlusion) and provides clear guidance
- **Visible Feature Analysis**: Only analyzes and comments on body parts that are actually visible in the image
- **Visual Body Feature Overlays**: Labeled bounding boxes highlight key body areas (neck, chest, backline, belly, legs, face)
- **Per-Feature Confidence**: Each detected feature shows its own confidence score (0-100%)
- **Age Cue Detection**: Identifies 5-10 visual cues based on expert hunter/biologist criteria
- **Age Weight System**: Shows how each cue pushes the estimate younger (-3) or older (+3)
- **Interactive Tap-to-Focus**: Tap any overlay to see detailed explanations of what the AI detected
- **Photo Quality Assessment**: Rates image quality and provides tips for better accuracy
- **Model Card Transparency**: Full disclosure of AI methods, data sources, and limitations

**Body Features Analyzed (TPWD-Compliant):**

*Primary Features (High Weight):*
- **Neck-to-Brisket Integration**: Smooth transition vs clear pinch point between neck and chest
- **Chest Depth vs Hindquarters**: Front-end dominance ratio (chest > hindquarters = mature)
- **Overall Body Depth**: Rib cage height from back to belly (structural, not fat-dependent)
- **Leg-to-Body Proportion**: Short legs relative to deep torso = mature (MOST RELIABLE single indicator)

*Secondary Features (Supporting Evidence):*
- **Backline Posture**: Level/arched (young) to swayed back (old) - rut-adjusted
- **Belly/Waist Line**: Tucked (young) to pot belly (old) - HEAVILY rut-adjusted
- **Head-to-Body Ratio**: Large head for body (young) to small head for massive body (post-mature)

**What NOT to Use for Aging (TPWD Guidelines):**
- Antler size or rack score (removed from age calculations)
- Fat-dependent features alone
- Muscle definition as primary indicator (informational only)

**Property Rules (Customizable):**
- Set minimum shooter age threshold (default 3.5 years, supports MLD requirements)
- Toggle rut season for adjusted feature weighting
- Configure region for body size normalization
- Deer below threshold marked as "LET WALK" with management guidance
- Deer meeting threshold marked as "SHOOTER (Meets X+ yrs)"
- Configurable via Settings screen

**Output:**
- **TPWD Disclaimer Banner**: Always displayed at top of results
- **Image Suitability Check**: Red warning banner if image is unsuitable (head-only, mounted deer, etc.) with specific guidance
- Estimated age CLASS (e.g., "3.5-4.5 years") - NOT exact age
- Overall confidence percentage (0-100%)
- Shooter/LET WALK badge with warden-safe reasoning
- "WHY THIS AGE?" evidence panel with:
  - Warning if no body features detected
  - **PRIMARY FEATURES** section (4 features with MATURE/IMMATURE/TRANSITIONAL indicators)
  - **SECONDARY FEATURES** section (3 supporting features)
  - Per-feature explanations in TPWD-compliant language
  - Net age push visualization (younger ←→ older)
- Manual notes and GPS tagging capability
- Photo tips if image quality is low or critical body parts are missing
- **Quick Rack Summary**: Shows estimated point count (~8pt, ~10pt, etc.)
- **"Run Full Rack Score Analysis" button**: Easily run complementary B&C analysis on the same deer

**Connectivity Requirements:**
- ⚠️ **Internet required** for AI-powered age analysis
- Offline mode with on-device AI is **coming soon** (signup in Settings to be notified)
- Photos captured offline are saved locally for later review

### 2. **Score My Rack** – Post-Shot Trophy Analysis (Explainable AI)
Used after the shot to estimate Boone & Crockett score with full transparency into how each measurement contributes to the final score.

**Explainable AI Features:**
- **Measurement Quality Assessment**: Automatically detects lower confidence measurements and provides tips for better angles
- **B&C Qualification Status**: Clear badge showing if the rack meets Boone & Crockett minimums (160" Typical / 185" Non-Typical)
- **Component-by-Component Breakdown**: Detailed explanations for each scoring component:
  - Main Beams: Length measurements with contribution to score
  - Tines (G1-G6): Individual tine measurements and why they matter
  - Mass (Circumferences): H1-H4 measurements showing antler thickness
  - Spread: Inside spread and how spread credit is calculated
  - Abnormal Points: Non-typical points that affect category determination
- **Per-Measurement Confidence**: Each measurement shows its own confidence score (0-100%)
- **Symmetry Deductions Explained**: Shows exactly which asymmetries are being deducted and why
- **Educational Context**: Each component includes hunter-friendly explanations of what makes a trophy-class buck
- **AI Point Counting Process**: View the AI's step-by-step enumeration of every point on the rack

**AI Analysis Focus:**
- Tine count (including brow tines)
- Rack spread measurements
- Main beam lengths
- Mass measurements (circumferences)
- Abnormal points detection
- Symmetry analysis for deductions

**Output:**
- Boone & Crockett score estimate (Gross and Net for both Typical and Non-Typical)

**Clean, Non-Redundant Layout:**
The results screen eliminates duplicate tappable elements. Each action appears in exactly one place:

- **Header Bar:**
  - Close button (left)
  - Share button (right) - single location for sharing

- **Main Content (Scrollable):**
  - Deer image with pinch-to-zoom
  - Main Analysis Results card (Age, Score, Tine Count, Confidence)
  - Recommended Category score card
  - Collapsible detail sections
  - "Run Full Age Analysis" button

- **Bottom Action Bar (Sticky):**
  - "Count Points" button - opens manual point counter
  - "Score Another Deer" button - primary action

- **Collapsible Sections (Tap to Expand):**
  - **Point Count Adjustment**: Only shows when abnormal points detected or manual override active
  - **Score Breakdown**: Gross/Net Typical and Non-Typical scores, deductions
  - **WHY THIS SCORE?**: Full explainable AI breakdown
  - **Component Totals**: Beam lengths, tine lengths, mass, spread credit
  - **Detailed Measurements**: Individual tine and beam measurements
  - **B&C Qualification**: Typical and Non-Typical minimum status
  - **Analysis Details**: Frames analyzed, processing time

Key info (age, point count, score) appears only once to avoid redundancy.

- "WHY THIS SCORE?" explainable section with:
  - Measurement quality notice if confidence is lower
  - B&C qualification badge (trophy-class or below minimum)
  - Main beams breakdown with measurements and explanations
  - Tines breakdown (G1-G6) with contribution to score
  - Mass/circumferences (H1-H4) with measurements
  - Spread measurements and credit calculation
  - Abnormal points (if present) affecting Non-Typical score
  - Symmetry deductions with detailed breakdown
  - AI point counting enumeration text
- Complete tine count with manual verification option
- Age estimation
- Confidence rating
- Qualification status
- **Quick Age Summary**: Shows brief age estimate (e.g., "3.5-4.5 yrs")
- **"Run Full Age Analysis" button**: Easily run complementary body-based age analysis on the same deer

**Connectivity Requirements:**
- Photos can be captured offline and saved to device
- Analysis requires internet connection
- **Offline Queue System**: Photos taken without signal are automatically queued and analyzed when connectivity returns

### Manual Point Counter with Two-Step Process
Users can verify AI point counts by manually tapping points on the image:
1. **Step 1: Right Antler** - Count all points on the right antler (deer's right = left side of image)
2. **Step 2: Left Antler** - Count all points on the left antler (deer's left = right side of image)
3. **Review** - See total with side-by-side breakdown before confirming

Features:
- Zoom slider (1x-5x) for detailed inspection
- Undo and reset buttons per side
- Color-coded markers (blue for right, green for left)
- AI vs manual count comparison
- Points persist when switching between steps

### Adjusted B&C Score Calculator
The app handles both under-counting (AI missed points) and over-counting (AI detected phantom points):

**When User Counts MORE Points (AI Under-Counted):**
1. **Update B&C Score Button** - Appears when manual count exceeds AI count
2. **Missed Tine Categories** - Select why points were missed:
   - Short Stickers/Kickers (1-3 inches) - Small offshoots from main tines
   - Drop Tines (3-12 inches) - Tines growing downward
   - Hidden Behind Other Tines (4-10 inches) - Obscured by angle
   - Lost in Background (3-8 inches) - Difficult to distinguish from brush
3. **Average Length Estimate** - User provides estimated average length of missed tines
4. **Adjusted Score Preview** - Shows calculation: Original + (missed points × avg length)
5. **Clear Explanation** - Full breakdown saved with analysis

**When User Counts FEWER Points (AI Over-Counted):**
1. **Update B&C Score Button** - Appears when manual count is less than AI count
2. **Auto-Calculated Adjustment** - The app automatically calculates the average tine length from the AI's own measurements
3. **Automatic Subtraction** - Phantom points are removed using: Original - (over-counted points × AI's avg tine length)
4. **No Guessing Required** - Since phantom points don't exist, users don't need to estimate their length - the AI's data is used instead

This approach ensures accurate score adjustments in both directions without requiring users to guess measurements for non-existent points.

## Features

### Unified Results Display
Every analysis (Age or Score mode) shows all key metrics:
- **Estimated Age** (years)
- **Rack Score** (Boone & Crockett inches)
- **Tine Count** (total points)
- **Confidence %** (Low/Med/High with visual indicator)
- **Shooter/Pass Suggestion** (if age < 3.5 years)
- **Share Results** button for social media

### Dual Input Methods

#### 1. One-Tap Burst Capture (Recommended)
- **2-Second Burst Mode**: Captures 8 frames over 2 seconds with a single tap
- **Multi-Frame Fusion**: Analyzes all frames to overcome partial occlusion
- **Highest Accuracy**: Multiple angles provide best measurement confidence
- **In-Camera Pro Tips**: Context-aware tips for Age vs Rack scoring
  - Age Mode: Full body framing, side view, rut timing tips
  - Rack Mode: Entire rack visible, lighting tips, angle guidance
  - Why Movement Helps: Educational explanation of parallax and 3D depth estimation

#### 2. Photo Upload
- **Gallery Selection**: Choose existing photos from device
- **Single Image Analysis**: Process pre-captured deer photos
- **Flexible Input**: Use photos taken with any camera

### Advanced RackScore™ AI Analysis
- **GPT-4o Vision API**: Using OpenAI's GPT-4o vision model for comprehensive analysis
- **Body Characteristics Analysis**: Evaluates chest, neck, posture, and facial features for age estimation
- **Automatic Antler Detection**: AI detects and measures antlers for scoring
- **Precise Point Counting**: Systematic scanning from skull base to tip catches all points including small brow tines
- **Tine Classification**: Automatically identifies G1-G6 tines and abnormal points
- **Main Beam Reconstruction**: Traces and measures curved main beams
- **Mass Measurements**: Calculates H1-H4 circumferences

### Real-World Scale Estimation
- **Multi-View Photogrammetry**: Triangulates scale from multiple frames
- **Depth-Based Scaling**: Uses device depth data when available
- **Skull Prior Method**: Fallback using known deer skull dimensions
- **Hybrid Approach**: Combines multiple methods for best accuracy

### Official Boone & Crockett Scoring
Implements complete B&C scoring rules:
- **Gross Scores**: Typical and Non-Typical before deductions
- **Net Scores**: After symmetry deductions
- **Spread Credit**: Inside spread (capped at longer main beam)
- **Component Totals**: Main beams, tines, mass, spread
- **Symmetry Deductions**: Left vs right differences
- **Abnormal Points**: Adds to Non-Typical score
- **Qualification Check**: Validates against B&C minimums (160" Typical, 185" Non-Typical)

### Age Estimation
- **Age Bands**: 1.5-2.5, 2.5-3.5, 3.5-4.5, 4.5-5.5, 5.5+ years
- **Multiple Factors**: Considers body size, antler mass, neck thickness, facial features
- **Confidence Levels**: Low, Med, High for each factor
- **Shooter Guidance**: Suggests LET WALK for bucks under 3.5 years for better herd management

### Results Log & History
- **Automatic Save**: Every analysis is automatically saved with photo and analysis mode
- **Separate Histories**: Distinct tabs for "Age My Deer" and "Score My Rack" analyses
- **Mode-Appropriate Display**:
  - Age cards show: Age estimate, confidence %, shooter/pass badge, quick rack summary (~8pt)
  - Rack cards show: B&C score, point count, category, quick age summary (3.5-4.5 yrs)
- **Mode Indicators**: Visual badges show analysis type (AGE/RACK) and if explainable AI was used
- **Browse History**: View all past analyses with thumbnails
- **Filter by Mode**: Toggle between All, Age, and Rack analyses
- **Full Details**: Tap any entry to see complete measurements and explanations
- **Mode-Specific Scorecards**:
  - Age mode detail view prioritizes age estimation, shooter/pass recommendation, and visible characteristics
  - Rack mode detail view prioritizes B&C scoring, point breakdown, and measurement components
  - Each mode includes complementary quick summaries (age cards show quick rack estimate, rack cards show quick age estimate)
- **Persistent Storage**: History saved across app sessions
- **Delete Options**: Remove individual entries or clear all
- **Share Results**: Export mode-specific summaries via text/email/social media
- **Future Linking**: Foundation for connecting age and rack analyses of the same deer via unique deer identifier

### Connectivity & Offline Capabilities
**Current Status:**
- **Age My Deer**: Requires internet connection for AI analysis
  - Real-time GPT-4o Vision analysis for explainable age estimation
  - **Manual Field Guide available offline** - Interactive scoring checklist for field use
  - Offline mode with on-device AI **coming soon** (see Settings to sign up for notifications)
  - Red warning banner shows when offline with button to access manual guide

- **Score My Rack**: Partial offline support
  - Photos can be captured and saved without internet
  - Automatic offline queue system stores photos locally
  - Auto-sync when connectivity restored
  - Clear UI indicators show queued status

### Distance Capture (NEW)

**Overview:**
Distance to the deer strongly affects perceived scale and therefore body/antler measurements and age confidence. The Distance Capture feature allows users to record the distance at observation time, improving accuracy and confidence in analysis results.

**Phase 1 (Current): Manual Distance Capture**

*Distance Picker UI:*
- Large tap targets optimized for field use (blinds, one-handed operation)
- Preset buttons: 50, 75, 100, 125, 150, 175, 200 yards
- Plus/minus stepper (±5 yards) for fine adjustment
- Manual numeric entry for precise values
- Validation: 10-600 yards range
- Last distance suggestion (if captured within 15 minutes)

*Distance Source Types:*
- **Preset**: User selected from quick-select buttons
- **Manual**: User typed in a value
- **Rangefinder (Manual)**: User ranged with device, entered value manually
- **Estimated**: User's best guess (medium confidence)

*Confidence Levels:*
- **High**: Ranged with rangefinder
- **Medium**: Estimated/guessed by user
- **Low**: Very rough estimate

*Integration Points:*
- **Live Camera**: Distance picker appears after burst capture completes
- **Photo Library**: Distance picker shown before analysis starts
- Optional: Users can skip distance capture if unknown

*Confidence Adjustments:*
Distance affects analysis confidence using these rules:
- No distance: 15% confidence reduction + warning
- 50-100 yards (high confidence): Full confidence
- 101-150 yards: 5% confidence reduction
- 151-200 yards: 10% confidence reduction
- 200+ yards: 20% confidence reduction + warning
- Medium/low confidence distances: Additional 5-10% reduction

*Trait Weight Adjustments (>125 yards):*
- Reduce antler mass/thickness weight by 15-25%
- Reduce brisket sag weight by 15-25%
- Increase antler configuration weight by 10-15%
- These adjustments account for what's harder/easier to see at distance

*Display Locations:*
- History list: Small distance chip on each entry
- History detail: Full distance breakdown with confidence
- Results header: Distance info with confidence indicator
- Warning banners when distance affects reliability

*Settings:*
- "Prompt for distance on every analysis" (default ON)
- "Remember last distance for 15 minutes" (default ON)
- Distance usage statistics (% with distance, ranged vs estimated)

*Data Model:*
```typescript
interface DistanceMeasurement {
  distanceYards: number;
  source: "manual" | "preset" | "rangefinder_bluetooth" | "rangefinder_manual" | "estimated_ai";
  confidence: "high" | "medium" | "low";
  timestamp: string;
  notes?: string;
}
```

**Phase 2 (Scaffold - Coming Soon): Bluetooth Rangefinder Integration**

The app is architected to support Bluetooth rangefinder integration in a future update:

*UI Elements (Scaffolded):*
- "Connect Rangefinder" option in Settings (disabled, "Coming Soon" badge)
- "Pull from rangefinder" button in Distance Picker (hidden until enabled)
- Connection states: Searching, Connected, Failed

*Supported Devices (Planned):*
- Sig Sauer (KILO1800BDX, KILO2400ABS, KILO3000BDX)
- Vortex (Fury HD 5000 AB, Ranger 1500)
- Leupold (RX-2800 TBR/W, RX-1600i TBR/W)

*Feature Flag:*
- `enableBluetoothRangefinder` in distance store (default: false)
- When enabled, shows rangefinder UI in Distance Picker

**Files:**
- `src/types/distance.ts` - Distance types and constants
- `src/components/DistancePicker.tsx` - Distance capture modal
- `src/components/DistanceDisplay.tsx` - Distance chip and detail components
- `src/state/distanceStore.ts` - Distance state management
- `src/utils/distance-adjustment.ts` - Confidence adjustment logic
- `src/utils/rangefinder-provider.ts` - Phase 2 BLE scaffold

**Manual Field Guide (Offline Age Estimation):**
- Interactive checklist for manual age estimation when offline
- **Practice Mode**: Accessible from Settings when online to learn the system before hunts
- **Field Mode**: Works 100% offline when no internet available
- Score 7 key body characteristics on 1-5 scale:
  - Neck Thickness (most reliable indicator during rut)
  - Chest Depth & Brisket
  - Backline Profile
  - Belly & Waist
  - Leg Proportions
  - Face Shape
  - Muscle Definition
- Real-time confidence calculation based on scored criteria
- Age band estimates (1.5-2.5, 2.5-3.5, 3.5-4.5, 4.5-5.5, 5.5+ years)
- Pro tips for each characteristic with age indicators
- Based on expert wildlife biologist criteria
- Practice scoring trail camera photos or live deer to build skills
- Access from camera screen when offline or Settings → "Practice Manual Aging"

**Network Monitoring:**
- App displays connectivity banner at top when offline/limited signal
- Camera screen shows mode-specific warnings:
  - Age mode: Shows "Use Manual Field Guide" button when offline
  - Rack mode: Allows capture with "Photos saved to queue" message
- Uses `@react-native-community/netinfo` for reliable connectivity detection

**Roadmap:**
- Offline age estimation with TensorFlow Lite (on-device AI)
- Deer tagging and tracking across multiple analyses
- Sign up in Settings → "Get Notified - Pro Features" to be alerted when these launch

## User Interface

### Woodland Color Palette
- **Muted Green**: #5A6447, #4A5339 (primary backgrounds)
- **Antler Beige**: #F5F5DC, #E5D4B8 (text and highlights)
- **Copper Highlights**: #D4AF37 (accents and branding)
- **Earth Tones**: #8B7355, #6B5A45 (buttons and cards)
- **Deep Forest**: #2B3420, #3D4A2F (base backgrounds)

### Branding
- **App Logo**: DeerAge with deer icon
- **Tagline**: "Know before you pull the trigger"
- **Footer Branding**: "Scoring powered by RackScore™ AI" (displayed on every screen)

### Navigation Flow
1. **Splash Screen** → DeerAge logo with RackScore™ AI branding (2.5 seconds)
2. **Home Screen** → Choose between "Age My Deer" or "Score My Rack" + Settings/History
3. **Mode Select** → Choose "Take Photo" or "Upload Photo"
4. **Camera/Upload** → Capture or select image
5. **Processing** → AI analysis in progress (routes to appropriate results screen)
6. **Age Results** → Explainable age analysis with overlays (Age mode)
   **OR Score Results** → B&C scoring with point breakdown (Score mode)
7. **Settings** → Configure Property Rules (minimum shooter age, species)
8. **History** → Browse and review past analyses

### One-Handed Operation Optimizations
The app is designed for hunters operating devices with one hand (often while holding binoculars, a rifle, or in a blind):

**Touch Targets (Apple HIG Compliant):**
- All interactive elements meet minimum 44x44pt touch targets
- Delete buttons, close buttons, and action icons enlarged for thumb reach
- Back buttons consistently positioned in top-left with adequate size

**Sticky Bottom Action Bars:**
- Results screens (Age and Score) feature persistent bottom action bars
- Primary actions (New Analysis, Share) always within thumb reach
- Manual point count button accessible in sticky bar (Score mode)

**Swipe Gestures:**
- History cards support swipe-to-delete with haptic feedback
- Red delete indicator reveals on swipe left
- Prevents accidental deletion with spring-back animation

**Haptic Feedback:**
- All primary buttons trigger haptic feedback on press
- Notification-style feedback on important results (SHOOT/LET WALK)
- Warning haptics on delete confirmations

**Share Bottom Sheets:**
- Share actions open as bottom sheets (thumb-friendly)
- Easy one-tap sharing from Results screens
- Cancel button at bottom for easy dismissal

**Horizontal Zoom Sliders:**
- Camera screens use horizontal zoom sliders (not pinch-to-zoom)
- Slider positioned at bottom of screen for one-handed operation
- Prevents need to use two hands while zooming on subject

**Reusable Button Component:**
- ActionButton and IconButton components in `/src/components/ActionButton.tsx`
- Consistent styling across the app
- Built-in haptic feedback and minimum touch targets

### Settings & Configuration
- **Property Rules**: Set minimum shooter age threshold (1.5-10 years)
- **Quick Presets**: 1.5, 2.5, 3.5, 4.5, 5.5+ year options
- **Custom Values**: Fine-tune to exact management goals
- **Species Selection**: Currently optimized for Whitetail (Mule Deer, Elk coming soon)

## Tech Stack

### Frontend
- **React Native 0.76.7** with **Expo SDK 53**
- **TypeScript** for type safety
- **NativeWind** (TailwindCSS for React Native)
- **Zustand** for state management with individual selectors
- **React Navigation** for native stack navigation

### Camera
- **react-native-vision-camera v4**: Advanced camera with burst capture
- **High Quality**: Optimized for detail preservation

### AI/ML
- **OpenAI GPT-4.1 Vision API**: Multi-modal image analysis for age estimation (40% faster than GPT-4o with better image understanding)
- **GPT-4.1 Model**: Used for both age analysis and rack scoring with specialized prompts
- **Multi-Frame Fusion**: Combines insights from multiple frames
- **Structured JSON Output**: Reliable measurement extraction
- **Accurate Point Counting Prompt**: Specialized prompt designed for highest accuracy point counting with systematic left-to-right enumeration

## File Structure

```
src/
├── api/
│   ├── deer-analysis.ts                 # Antler detection & fusion (Score mode)
│   ├── explainable-age-analysis.ts      # Explainable age estimation (Age mode)
│   ├── openai.ts                        # OpenAI client
│   └── chat-service.ts                  # AI helpers
├── components/
│   ├── ManualPointCounter.tsx           # Interactive point counter with zoom
│   ├── ZoomableImage.tsx                # Pinch-to-zoom image viewer
│   └── BodyFeatureOverlay.tsx           # Interactive body feature overlays
├── screens/
│   ├── SplashScreen.tsx                 # DeerAge intro with RackScore™ branding
│   ├── HomeScreen.tsx                   # Mode selection (Age vs Score)
│   ├── ModeSelectScreen.tsx             # Photo source selection
│   ├── DeerCameraScreen.tsx             # Burst capture camera with Pro Tips
│   ├── PhotoSelectScreen.tsx            # Gallery photo upload
│   ├── ProcessingScreen.tsx             # Analysis progress
│   ├── ResultsScreen.tsx                # B&C scoring results with WHY THIS SCORE? (Score mode)
│   ├── AgeResultScreen.tsx              # Explainable age results with WHY THIS AGE? (Age mode)
│   ├── SettingsScreen.tsx               # Property Rules configuration & feature notifications
│   ├── OfflineAgeGuideScreen.tsx        # Manual field guide for offline age estimation
│   ├── HistoryScreen.tsx                # Browse saved analyses (with Age/Rack tabs)
│   └── HistoryDetailScreen.tsx          # View saved results
├── navigation/
│   └── RootNavigator.tsx                # Navigation structure
├── state/
│   ├── deerScoringStore.ts              # Zustand store with mode selection & property rules
│   └── networkStore.ts                  # Network connectivity & offline queue management
├── types/
│   └── deer-scoring.ts                  # TypeScript types (ExplainableAgeEstimation, ExplainableRackScoring, DeerIdentifier)
└── utils/
    ├── boone-crockett-calculator.ts     # B&C scoring logic
    ├── scale-and-age-estimation.ts      # Scale estimation & age utils
    ├── age-cue-library.ts               # Age cue definitions and explanations (1.5-5.5+ years)
    └── rack-scoring-criteria-library.ts # Rack scoring component explanations
```

## How It Works

### Age My Deer Mode (Explainable AI)
1. **Select Mode**: User taps "Age My Deer" on home screen
2. **Choose Input**: Select camera or upload photo
3. **Capture/Upload**: Take broadside photo showing full deer body
4. **AI Analysis**: RackScore™ AI analyzes body features using GPT-4o Vision:
   - **Validates image suitability**: Checks if enough body parts are visible (rejects head-only, mounted deer, excessive occlusion)
   - Detects and labels only visible body features (neck, chest, brisket, backline, belly, legs, face, hindquarters)
   - Creates bounding box overlays for each visible feature
   - Compares detected patterns to expert age cue library (1.5-5.5+ years)
   - **Only comments on features that are actually visible** (e.g., no belly analysis if belly not shown)
   - Assigns confidence scores and age weights to each cue
   - Calculates net age push and overall confidence
   - Assesses image quality and generates specific photo tips if needed
5. **Results**: Display explainable age screen with:
   - **Red warning banner** if image is unsuitable with clear explanation
   - Primary age estimate with confidence bar
   - Shooter/Pass badge based on Property Rules
   - Interactive body feature overlays (tap to explore)
   - "WHY THIS AGE?" evidence panel with cue checklist (or warning if no features detected)
   - Net age push visualization (only shown if cues were detected)
   - Model Card for AI transparency
   - Manual notes and GPS tagging
6. **History**: Analysis automatically saved with full explainability data

### Score My Rack Mode
1. **Select Mode**: User taps "Score My Rack" on home screen
2. **Choose Input**: Select camera or upload photo (burst mode recommended)
3. **Capture**: App captures 8 frames over 2 seconds (or single upload)
4. **Detection**: AI detects antlers, tines, and measurements from each frame
5. **Fusion**: Measurements combined to create comprehensive antler model
6. **Scoring**: B&C rules applied to calculate scores
7. **Results**: Display complete scorecard with age estimate, tine count, confidence
8. **History**: Analysis automatically saved with image

## Usage

### Quick Start
1. Launch DeerAge
2. Choose "Age My Deer" (for pre-shot) or "Score My Rack" (for post-shot)
3. Take a photo with burst capture or upload existing image
4. Wait 30-60 seconds for AI analysis (parallel processing optimizes speed)
5. View unified results with all metrics
6. Share or save to history

### Best Practices

**For Age My Deer (Explainable AI):**
- ✓ Take **broadside (side view) photos** showing full body from head to tail
- ✓ Ensure **good natural lighting** (avoid backlit or dark conditions)
- ✓ Minimize **brush/tree occlusion** of key body areas
- ✓ **Fill frame** with the deer's body (not too far away)
- ✓ Capture deer in **standing or walking pose** (not running or jumping)
- ✓ **Avoid head-only or shoulder mount photos** - these cannot be analyzed for body-based aging
- ✓ Check the **confidence score** - low confidence suggests retaking with better angle/lighting
- ✓ Review the **red warning banner** if present - it explains why the image is unsuitable
- ✓ If you receive photo tips, follow them for more accurate results
- ✓ Configure **Property Rules** in Settings to match your management goals

**For Score My Rack (Post-Shot):**
- ✓ Frame antlers clearly in view, **side profile preferred**
- ✓ Use **Burst Mode** (hold camera steady for 2 seconds) for best accuracy
- ✓ **Lighting**: Good natural lighting improves AI confidence
- ✓ **Distance**: 20-50 yards optimal for rack analysis

## Future Enhancements (Multi-Species Ready)

The app is architected to support additional species using the same RackScore™ AI engine:
- **Elk** (Roosevelt, Rocky Mountain)
- **Moose** (Alaska-Yukon, Canada, Shiras)
- **Fallow Deer**
- **Red Deer**
- **Mule Deer**

Each species will have appropriate age estimation factors and scoring systems (SCI, B&C, Pope & Young).

## Environment Variables

Required:
- `EXPO_PUBLIC_VIBECODE_OPENAI_API_KEY`: OpenAI API key for GPT-4o Vision

**IMPORTANT - TestFlight/Production Builds:**
Environment variables must be configured in `eas.json` for TestFlight and production builds. The `.env` file only works in development. All required API keys are now properly configured in the `eas.json` file under each build profile (development, preview, production).

Optional (for email collection backend):
- `AIRTABLE_API_TOKEN`: Personal access token from Airtable (starts with `pat.`)
- `AIRTABLE_BASE_ID`: Base ID from your Airtable workspace (starts with `app`)
- `AIRTABLE_TABLE_ID`: Table ID from your Airtable base (starts with `tbl`)

### Setting Up Email Collection with Airtable

**1. Create Airtable Base:**
- Create a new base called "Deer Score Pro Waitlist"
- Create a table called "Email Signups" with these fields:
  - **Email** (Single line text) - Primary field
  - **Signed Up At** (Date & Time)
  - **Platform** (Single select: iOS, Android)
  - **Analysis Count** (Number)
  - **App Version** (Single line text)

**2. Get API Credentials:**
- Go to https://airtable.com/create/tokens
- Create new token with scopes: `data.records:read`, `data.records:write`
- Add access to your base
- Copy the token (starts with `pat...`)

**3. Get Base and Table IDs:**
- Base ID: Open your base, look at URL → `https://airtable.com/appXXXXXXXXXXXXXX`
- Table ID: Click table dropdown → Copy table URL → `tblXXXXXXXXXXXXXX`

**4. Add to Vibecode ENV Tab:**
```
AIRTABLE_API_TOKEN=pat.your_token_here
AIRTABLE_BASE_ID=appXXXXXXXXXXXXXX
AIRTABLE_TABLE_ID=tblXXXXXXXXXXXXXX
```

**How it works:**
- User emails are always saved locally on device (works without Airtable)
- If Airtable credentials are configured, emails are also sent to your Airtable base
- Includes platform (iOS/Android), analysis count, app version, and timestamp
- Emails collected via Settings screen or post-analysis prompts (1st & 5th use)
- Graceful fallback: app continues working even if Airtable API fails

## Recent Bug Fixes

### OpenAI 502 Error Handling (Fixed)
**Issue:** When OpenAI's API returns a 502 proxy error, users were seeing a technical error message instead of a user-friendly message explaining the situation.

**Root Cause:** The `openai-fetch.ts` file was not handling specific HTTP error codes (502, 503, 429, etc.) with user-friendly messages. It was just passing through the raw error which showed up as "OpenAI API Error: Error: 502 proxy error".

**Fix:**
1. Enhanced error handling in `src/api/openai-fetch.ts` to catch specific HTTP status codes:
   - 502: "OpenAI service is temporarily unavailable. Please try again in a moment."
   - 503: "OpenAI service is under heavy load. Please try again in a few seconds."
   - 429: "Too many requests. Please wait a moment and try again."
   - 401: "API configuration error. Please check your settings."
   - 500+: "OpenAI server error. Please try again in a moment."
2. Added better timeout error messages
3. Added network error detection and user-friendly messages

**Status:** Fixed. Users will now see clear, actionable error messages when OpenAI's API experiences issues.

### Alert.alert Replaced with Custom ErrorModal (Fixed)
**Issue:** App was using React Native's `Alert.alert` for error messages and confirmations, which violates Vibecode guidelines to always use custom modals instead of native alerts.

**Root Cause:** Multiple screens were using `Alert.alert` for displaying errors and confirmations, including 502 errors from OpenAI service.

**Fix:**
1. Created reusable `ErrorModal` component in `src/components/ErrorModal.tsx`
2. Replaced all `Alert.alert` calls in:
   - `AgeResultScreen.tsx` - Notes saved confirmation
   - `HistoryScreen.tsx` - Delete entry and clear all confirmations
   - `SettingsScreen.tsx` - Email validation and signup errors/success
3. Added proper error handling with custom modals for better UX

**Status:** Fixed. All Alert.alert calls have been replaced with custom ErrorModal component following Vibecode guidelines.

### TestFlight API Configuration Error (Fixed)
**Issue:** External TestFlight testers were experiencing "Analysis Failed - API configuration error" when using "Score My Rack" and a green blank screen when using "Age My Deer".

**Root Cause:** Environment variables (API keys) were only configured in `.env` file, which only works in development. Production builds via EAS need environment variables explicitly configured in `eas.json`.

**Fix:**
1. Added all API keys to `eas.json` under the `env` field for all build profiles (development, preview, production)
2. Fixed error handling in age analysis - now properly throws errors instead of silently failing and navigating to a blank screen

**Status:** Fixed. Next production build will include the proper API key configuration and improved error handling.

### Graceful Error Handling Across All Capture Paths (Fixed)
**Issue:** When users took photos of non-deer objects (e.g., a chair) through the DeerCameraScreen (live camera) or PhotoSelectScreen (uploaded photos), the error handling was harsh and showed generic "Analysis Failed" messages without helpful guidance. The QuickCheckCameraScreen had graceful error handling with tips, but the other paths did not.

**Root Cause:** The ProcessingScreen only had basic error display without categorizing different error types or providing contextual tips for how to fix the issue.

**Fix:**
1. Enhanced `ProcessingScreen.tsx` with categorized error handling:
   - **NOT A DEER**: Detects when image is not a deer with appropriate tips
   - **NO ANTLERS VISIBLE / BODY NOT VISIBLE**: Context-aware messaging based on analysis mode (age vs score)
   - **NETWORK ERROR**: Connection issues with connectivity tips
   - **ANALYSIS TIMEOUT**: Timeout errors with suggestions to retry
   - **IMAGE QUALITY ISSUE**: Poor quality images with photo tips
2. Added visual error UI with:
   - Color-coded gradient backgrounds (amber for image issues, red for errors)
   - Appropriate icons for each error category
   - Thumbnail of the problem image
   - Contextual tips section for how to get better results
   - "Try Another Photo" button that navigates to mode selection
3. Added haptic feedback:
   - Error haptic on capture failures in DeerCameraScreen and PhotoSelectScreen
   - Error haptic when error screen appears in ProcessingScreen
   - Medium impact haptic when burst capture starts

**Status:** Fixed. All three capture paths (Quick Check, Live Camera, Photo Upload) now have consistent, graceful error handling with helpful tips.

### Age My Deer Image Validation (Fixed)
**Issue:** "Age My Deer" mode was attempting to age non-deer objects (like furniture) instead of properly detecting and rejecting invalid images with helpful feedback.

**Root Cause:** The `explainable-age-analysis.ts` API did not have image validation to detect non-deer images before attempting age analysis. The AI would try to analyze any image as if it were a deer.

**Fix:**
1. Added comprehensive image validation to the AI prompt in `explainable-age-analysis.ts`:
   - First step now checks if image contains a deer
   - Validates it's not furniture, objects, people, vehicles, etc.
   - Returns `isValidDeerImage: false` with reason codes for invalid images
2. Added proper error throwing for invalid images:
   - `not_deer`: "This image does not appear to contain a deer"
   - `head_only`: "Only the head is visible - need full body"
   - `poor_quality`: "Image quality too poor for analysis"
   - `not_visible`: "Deer's body not clearly visible"
3. Enhanced ProcessingScreen error categorization to catch new error messages
4. All invalid images now show the graceful error UI with tips

**Status:** Fixed. Age My Deer now properly rejects non-deer images with helpful feedback.

## Monetization - Investor-Grade Tier System

DeerAge implements a **Constitution-compliant tier system** designed for:
- **8× contribution margin** at worst-case usage
- **Perceived generosity** exceeding actual cost exposure
- **Identity-based** upgrade framing (not transactional)

### Product Constitution

The app is governed by `/src/lib/CONSTITUTION.ts` which enforces:

**Feature Classification:**
- **Habit Features** (Quick Check): Cheap, abundant, minimal friction
- **Standard Features** (Age My Deer): Balanced limits, core value
- **Obsession Features** (Score My Rack): Expensive, scarce, intentionally gated

**UX Rules:**
- Value delivered BEFORE limits shown
- Soft scarcity language only ("Resets next month", not "Limit reached")
- Never interrupt first successful action
- Identity-based upgrade copy ("Join the serious hunters")

### Tier Structure

#### Explorer (Free) - Lifetime Caps
- **Quick Check**: 10 total (lifetime)
- **Age My Deer**: 2 total (lifetime)
- **Score My Rack**: Not available
- Purpose: Deliver real value, build trust, create curiosity

#### Scout ($5/month)
- **Quick Check**: Unlimited
- **Age My Deer**: 20/month
- **Score My Rack**: Not included
- Identity: "Dedicated hunter building skills"

#### Hunter ($9/month)
- **Quick Check**: Unlimited
- **Age My Deer**: 40/month
- **Score My Rack**: Not included
- Identity: "Serious hunter committed to quality harvests"

#### Trophy ($15/month)
- **Quick Check**: Unlimited
- **Age My Deer**: 50/month
- **Score My Rack**: 12/month
- Identity: "Trophy hunter pursuing excellence"

#### Outfitter ($25/month)
- **Quick Check**: Unlimited
- **Age My Deer**: 80/month
- **Score My Rack**: 20/month
- Identity: "Professional guide or land manager"

### Implementation Architecture

**Core Files:**
- `src/lib/CONSTITUTION.ts` - Single source of truth for all rules
- `src/state/subscriptionStoreV2.ts` - Tier-aware usage tracking
- `src/hooks/useUsageGuard.ts` - Constitution-compliant limit checking
- `src/screens/TierPaywallScreen.tsx` - Identity-based paywall UI
- `src/components/ShareableResultCard.tsx` - Zero-AI-cost sharing

**RevenueCat Configuration:**
- Entitlements: `scout`, `hunter`, `trophy`, `outfitter`
- Products: `scout_monthly`, `hunter_monthly`, `trophy_monthly`, `outfitter_monthly`
- Offering: `tiers` (current)

### Prohibited Copy (Never Use)

The Constitution explicitly prohibits these terms in user-facing copy:
- "denied", "blocked", "limit reached"
- "tokens", "AI cost", "API calls"
- "upgrade required", "pay to unlock"

### Approved Copy Patterns

**Soft Scarcity:**
- "Resets next month"
- "Unlock deeper analysis"
- "Upgrade to keep momentum"

**Identity-Based Upgrades:**
- "Join the serious hunters" (Scout)
- "Commit to quality harvests" (Hunter)
- "Pursue trophy-class excellence" (Trophy)
- "Go professional" (Outfitter)

### Virality Without AI Cost

Shareable artifacts:
- Screenshot-friendly result cards
- Subtle DeerAge branding watermark
- Zero additional AI calls for sharing
- Works without login friction

## Notes

- Accuracy depends on image quality and visibility
- Burst mode provides higher confidence than single images
- Shooter/Pass suggestions are guidelines based on age estimation
- All measurements in inches per B&C standards
- RackScore™ AI improves with continued use and feedback
