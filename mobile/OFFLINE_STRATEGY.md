# Offline Mode Strategy for DeerAge App

## Current State Analysis

### What Works Online Only (Requires Internet):
1. **Age My Deer**: Uses GPT-4o Vision API (`gpt-4o-2024-11-20`)
   - File: `src/api/explainable-age-analysis.ts`
   - Analyzes body characteristics for age estimation
   - Provides explainable AI with confidence scores

2. **Score My Rack**: Uses GPT-4o Vision API or Grok-3 Vision API
   - File: `src/api/deer-analysis.ts`
   - Measures antler characteristics for B&C scoring
   - Multi-frame fusion analysis

3. **Dependencies**:
   - `callOpenAIChat()` from `openai-fetch.ts`
   - Base64 image upload to cloud API
   - Real-time API responses

### What Already Works Offline:
- Camera capture with burst mode
- Image storage and compression (expo-file-system)
- Local state management (Zustand + AsyncStorage)
- History viewing of past analyses
- UI/UX and navigation

---

## Problem for Hunters

**Critical Use Case**: Hunters in deer blinds need **real-time age estimation** to make shooting decisions, but they are often in remote areas with:
- No cell signal
- Poor/intermittent connectivity
- Need for instant (< 3 second) analysis
- Cannot wait for cloud API responses

**Less Critical**: Rack scoring (post-harvest) can be done later when connected, as it's not time-sensitive.

---

## Solution Options

### Option 1: On-Device AI with TensorFlow Lite (RECOMMENDED)
**Best for: Age My Deer (time-sensitive decision making)**

#### Technology Stack:
- **Library**: `react-native-fast-tflite` (2025 - uses JSI for zero-copy)
- **Model Options**:
  - MobileNetV3-Small (3.5 MB, optimized for mobile)
  - EfficientNet-Lite (4-7 MB models available)
  - Custom trained TFLite model
- **Performance**: 30+ inferences/second on modern devices

#### Implementation Steps:

##### 1. Install Dependencies
```bash
bun add react-native-fast-tflite
cd ios && pod install && cd ..
```

##### 2. Create/Train TFLite Model
**Option A: Use Pre-trained Wildlife Model**
- Start with MobileNetV3 or EfficientNet trained on wildlife datasets
- Fine-tune on deer images with age labels
- Convert to TFLite format

**Option B: Custom Training**
- Collect labeled deer dataset (age classes: 1.5-2.5, 2.5-3.5, 3.5-4.5, 4.5-5.5, 5.5+)
- Train classifier on body features
- Export as `.tflite` file (target < 10 MB)

##### 3. Add Model to App
```typescript
// Place model file in: assets/models/deer_age_classifier.tflite
// Reference in app.json:
{
  "expo": {
    "plugins": [
      ["react-native-fast-tflite", {
        "includeInterpreterOptions": true
      }]
    ]
  }
}
```

##### 4. Create Offline Age Analysis Service
```typescript
// src/api/offline-age-analysis.ts
import { TFLiteModel } from 'react-native-fast-tflite';
import * as FileSystem from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

let model: TFLiteModel | null = null;

export const initializeOfflineModel = async () => {
  try {
    const modelPath = `${FileSystem.bundleDirectory}assets/models/deer_age_classifier.tflite`;
    model = await TFLiteModel.loadFromAsset(modelPath);
    console.log('Offline model loaded successfully');
  } catch (error) {
    console.error('Failed to load offline model:', error);
  }
};

export const analyzeAgeOffline = async (imageUri: string): Promise<OfflineAgeResult> => {
  if (!model) throw new Error('Model not initialized');

  // Preprocess image to model input size (e.g., 224x224)
  const processed = await manipulateAsync(
    imageUri,
    [{ resize: { width: 224, height: 224 } }],
    { compress: 0.8, format: SaveFormat.JPEG }
  );

  // Run inference
  const result = await model.runSync([processed.uri]);

  // Parse output tensor to age class probabilities
  const ageClasses = ['1.5-2.5', '2.5-3.5', '3.5-4.5', '4.5-5.5', '5.5+'];
  const probabilities = result[0]; // Array of confidence scores

  const maxIdx = probabilities.indexOf(Math.max(...probabilities));
  const confidence = probabilities[maxIdx] * 100;

  return {
    estimatedAge: ageClasses[maxIdx],
    confidence,
    isOffline: true,
    availableOnline: false, // Could upgrade to cloud for explainable AI
  };
};
```

##### 5. Hybrid Online/Offline Strategy
```typescript
// src/state/deerScoringStore.ts - processFrames()

import NetInfo from '@react-native-community/netinfo';
import { analyzeExplainableAge } from '../api/explainable-age-analysis';
import { analyzeAgeOffline } from '../api/offline-age-analysis';

// In processFrames for Age Mode:
if (analysisMode === "age") {
  // Check connectivity
  const netState = await NetInfo.fetch();
  const isConnected = netState.isConnected && netState.isInternetReachable;

  if (isConnected) {
    // ONLINE: Use GPT-4o for full explainable AI
    const explainableAge = await analyzeExplainableAge(imageUri, minimumShooterAge);
    // ... create full result with overlays, cues, etc.
  } else {
    // OFFLINE: Use TFLite for fast basic age estimation
    const offlineAge = await analyzeAgeOffline(imageUri);

    // Create simplified result
    const result = {
      analysisId: `deer-age-offline-${Date.now()}`,
      analysisMode: "age",
      age: {
        estimatedAge: offlineAge.estimatedAge,
        confidence: offlineAge.confidence,
      },
      isOfflineResult: true, // Flag for UI
      canUpgradeOnline: true, // Show "Upgrade to Full Analysis" button when online
      // ... rest of minimal fields
    };
  }
}
```

##### 6. Update UI for Offline Mode
```typescript
// src/screens/AgeResultScreen.tsx

{currentResult.isOfflineResult && (
  <View className="bg-yellow-600 p-4 rounded-xl mb-4">
    <View className="flex-row items-center mb-2">
      <Ionicons name="cloud-offline" size={24} color="white" />
      <Text className="text-white font-bold ml-2">Offline Quick Estimate</Text>
    </View>
    <Text className="text-white/90 text-sm">
      Basic age estimation without detailed analysis. Connect to internet for full explainable AI with body feature overlays.
    </Text>

    {netState.isConnected && currentResult.canUpgradeOnline && (
      <Pressable
        onPress={handleUpgradeToFullAnalysis}
        className="bg-white rounded-lg py-3 mt-3"
      >
        <Text className="text-yellow-600 font-bold text-center">
          Upgrade to Full Analysis Now
        </Text>
      </Pressable>
    )}
  </View>
)}
```

#### Advantages:
- ✅ Works completely offline
- ✅ Fast (< 1 second inference)
- ✅ Small model size (3-10 MB)
- ✅ No API costs for offline usage
- ✅ Privacy - data never leaves device
- ✅ Hybrid approach: upgrade to cloud when available

#### Disadvantages:
- ⚠️ Requires model training/fine-tuning
- ⚠️ Less detailed than GPT-4o (no explainable AI features)
- ⚠️ Need labeled deer dataset for training
- ⚠️ May be less accurate than cloud models initially

---

### Option 2: Queue and Sync Pattern
**Best for: Non-time-sensitive analysis (Rack Scoring)**

#### Concept:
- Allow users to capture photos offline
- Queue analysis requests locally
- Auto-sync when connectivity restored
- Show "Pending Analysis" state in UI

#### Implementation:
```typescript
// src/state/offlineQueue.ts
interface QueuedAnalysis {
  id: string;
  type: 'age' | 'score';
  imageUri: string;
  timestamp: Date;
  status: 'queued' | 'processing' | 'completed' | 'failed';
}

export const queueAnalysis = async (type: 'age' | 'score', imageUri: string) => {
  // Add to local queue (AsyncStorage)
  const queuedItem: QueuedAnalysis = {
    id: `queued-${Date.now()}`,
    type,
    imageUri,
    timestamp: new Date(),
    status: 'queued'
  };

  // Save to AsyncStorage
  // Show "Pending" badge in history
};

// Background sync when online
NetInfo.addEventListener(state => {
  if (state.isConnected) {
    processQueuedAnalyses();
  }
});
```

#### Advantages:
- ✅ No model training needed
- ✅ Full cloud analysis quality when synced
- ✅ Simple implementation

#### Disadvantages:
- ❌ Not real-time (defeats purpose for age estimation)
- ❌ User must wait for connectivity
- ❌ Not suitable for in-the-moment shooting decisions

---

### Option 3: Cached/Pre-computed Heuristics (Quick Fallback)
**Best for: Emergency fallback when both offline model and internet fail**

#### Concept:
- Use computer vision heuristics (no ML)
- Basic body-to-leg ratio calculations
- Neck thickness estimation via image processing
- Simple rule-based age classification

#### Implementation:
```typescript
// src/api/heuristic-age-estimation.ts
export const estimateAgeHeuristic = async (imageUri: string) => {
  // Use expo-image-manipulator + basic CV
  // 1. Detect deer silhouette (color segmentation)
  // 2. Calculate body-to-leg height ratio
  // 3. Estimate neck thickness vs body size
  // 4. Apply rule-based age classes

  return {
    estimatedAge: "3.5-4.5 years",
    confidence: 40, // Lower confidence
    method: "heuristic",
    note: "Basic estimation - internet required for accurate analysis"
  };
};
```

#### Advantages:
- ✅ Works 100% offline
- ✅ No model files needed
- ✅ Zero dependencies

#### Disadvantages:
- ❌ Very low accuracy
- ❌ No explainable features
- ❌ Not suitable for serious hunting decisions

---

## RECOMMENDED IMPLEMENTATION PLAN

### Phase 1: Basic Offline Age Estimation (Priority: HIGH)
1. Install `react-native-fast-tflite`
2. Train/acquire basic deer age classifier (MobileNetV3-Small)
3. Implement hybrid online/offline logic with NetInfo
4. Add offline indicators to UI
5. Test in airplane mode

**Timeline**: 3-5 days
**Model Training**: Could use transfer learning on existing wildlife classifier

### Phase 2: Offline UI Enhancements
1. Add connectivity status indicator
2. Show "Offline Mode" badge
3. Add "Upgrade to Full Analysis" button when online
4. Queue rack scoring for later (not time-sensitive)

**Timeline**: 2 days

### Phase 3: Model Optimization
1. Collect more labeled deer images
2. Fine-tune model for better accuracy
3. Add confidence calibration
4. A/B test against cloud results

**Timeline**: Ongoing

---

## Alternative: Keep Rack Scoring Online-Only

**Justification**:
- Rack scoring is post-harvest (not time-sensitive)
- Requires complex B&C measurements (better suited for cloud AI)
- Users can wait until they have connectivity
- Can queue and sync later

**Compromise**:
- Age estimation: Offline with TFLite (critical for hunting decisions)
- Rack scoring: Online-only (can be done at camp/home)
- Show clear "Requires Internet" badge for rack scoring when offline

---

## Network Detection Setup

```typescript
// App.tsx - Add network monitoring
import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

export default function App() {
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected ?? false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <>
      {!isConnected && (
        <View className="bg-red-500 p-2">
          <Text className="text-white text-center text-sm">
            Offline Mode - Limited Features Available
          </Text>
        </View>
      )}
      {/* Rest of app */}
    </>
  );
}
```

---

## Estimated File Sizes
- MobileNetV3-Small TFLite: ~3.5 MB
- EfficientNet-Lite0: ~4.5 MB
- Custom trained model: 5-10 MB
- Total app size increase: < 10 MB

---

## Testing Strategy
1. Test in Airplane Mode
2. Test with intermittent connectivity
3. Test model accuracy vs cloud results
4. Test battery impact of on-device inference
5. Test in real hunting scenarios (field testing)

---

## User Communication

### Settings Screen Option:
```
[X] Enable Offline Age Estimation
    Use on-device AI when internet is unavailable.
    Basic age estimation without detailed analysis.
    Requires 5 MB model download.
```

### First-time Setup:
```
"Download Offline Model?"

DeerAge can estimate deer age even without internet using on-device AI. This is useful in remote hunting areas.

- Offline mode provides basic age estimation
- Full explainable analysis requires internet
- Model size: 5 MB

[Download Now]  [Skip - Online Only]
```

---

## Cost-Benefit Analysis

### Current (Online-Only):
- **Pros**: High accuracy, explainable AI, no model training
- **Cons**: Requires internet, API costs, unusable in remote areas
- **Critical Issue**: Cannot help hunters make real-time decisions in the field

### With Offline TFLite:
- **Pros**: Works anywhere, fast, no API costs for basic analysis, privacy
- **Cons**: Requires model training, less detailed than cloud
- **Critical Benefit**: Enables real-time hunting decisions in remote locations

### Hybrid Approach (BEST):
- **Online**: Full GPT-4o explainable AI with overlays (when available)
- **Offline**: TFLite basic age classification (when needed)
- **User Choice**: "Upgrade to Full Analysis" button when connectivity restored
- **Result**: Best of both worlds

---

## Next Steps

1. **Immediate**: Test NetInfo connectivity detection
2. **Short-term**: Prototype TFLite integration with pre-trained wildlife model
3. **Medium-term**: Fine-tune model on deer dataset
4. **Long-term**: Collect user data (opt-in) to improve model accuracy

---

## Questions to Consider

1. **Model Accuracy Target**: What minimum accuracy is acceptable for offline mode? (e.g., 70% vs 85% cloud)
2. **Model Size Limit**: What's the max acceptable app size increase? (5 MB? 10 MB? 20 MB?)
3. **User Preference**: Should offline mode be opt-in or automatic?
4. **Rack Scoring Offline**: Is it worth implementing offline rack scoring, or keep it online-only?
5. **Dataset**: Do we have access to labeled deer age datasets for training?

---

## Conclusion

**For "Age My Deer" (time-sensitive)**: Implementing offline TFLite mode is **critical** for the app's core value proposition. Hunters cannot make real-time decisions without it.

**For "Score My Rack" (post-harvest)**: Keep online-only with queue/sync pattern. Users can wait for connectivity.

**Recommended Approach**: Hybrid online/offline with clear UI indicators and the ability to upgrade offline results to full analysis when connectivity is restored.
