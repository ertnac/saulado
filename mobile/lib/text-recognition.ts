import Constants, { ExecutionEnvironment } from 'expo-constants'

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient

export interface TextBlock {
  text: string
  lines?: { text: string }[]
}

export interface TextRecognitionResult {
  text: string
  blocks: TextBlock[]
}

interface TextRecognitionModuleType {
  recognize: (uri: string) => Promise<TextRecognitionResult>
}

let nativeTextRecognition: TextRecognitionModuleType | null = null

if (!isExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ml = require('@react-native-ml-kit/text-recognition') as {
      default: TextRecognitionModuleType
    }
    nativeTextRecognition = ml.default
  } catch {
    // Native module not linked in current binary
  }
}

export const TextRecognition = {
  recognize: async (uri: string): Promise<TextRecognitionResult> => {
    if (nativeTextRecognition?.recognize) {
      return await nativeTextRecognition.recognize(uri)
    }
    throw new Error(
      'Text recognition (OCR) requires a custom development build (npx expo run:android) and is not available in Expo Go.',
    )
  },
}

export default TextRecognition
