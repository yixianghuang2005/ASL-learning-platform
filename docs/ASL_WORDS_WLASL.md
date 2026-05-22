# ASL Words Recognition with WLASL

This first version uses WLASL for 10 isolated ASL words and keeps the word model separate from the A-Z letter model.

## Scope

- Dataset: WLASL
- Words: `hello`, `thank you`, `please`, `sorry`, `help`, `yes`, `no`, `want`, `like`, `eat`
- Frontend route: `/asl-words`
- Feature extractor: MediaPipe Hands, two-hand landmark sequence
- Model: lightweight temporal CNN exported to ONNX
- Browser model files:
  - `frontend/public/models/asl_words_sequence.onnx`
  - `frontend/public/models/asl_words_classes.json`

## Workflow

1. Download WLASL metadata and videos using the official WLASL project.

2. Place files under:

```text
ai-backend/pose_recognition/data/WLASL_v0.3.json
ai-backend/pose_recognition/data/wlasl_videos/
```

3. Build the 10-word manifest:

```powershell
cd ai-backend
python pose_recognition/scripts/prepare_wlasl_subset.py
```

4. Extract MediaPipe landmark sequences:

```powershell
python pose_recognition/scripts/extract_wlasl_sequences.py
```

5. Train the word sequence model:

```powershell
python pose_recognition/scripts/train_word_sequence.py
```

6. Export and copy the model to the frontend:

```powershell
python pose_recognition/scripts/export_word_onnx.py --copy-to-frontend
```

7. Start the frontend and open `/asl-words`.

## Architecture Note

The A-Z letter model and ASL words model are intentionally separate:

- Letter model: mostly static handshape classification.
- Word model: dynamic sequence classification across multiple frames.

Both can share MediaPipe Hands, but they should not share the same classifier because the input shape and task are different.

## YOLO Research Direction

YOLO can still be used later as a feasibility comparison for static sign or hand-region detection. For dynamic ASL words, MediaPipe landmark sequences are the better first implementation path because they are lighter and more suitable for browser-based interaction.
