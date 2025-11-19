from ultralytics import YOLO

# Load your YOLOv8 model
model = YOLO("yolov8n.pt")   # make sure yolov8n.pt is in the same folder

# Export to ONNX
model.export(format="onnx", opset=12, dynamic=True, imgsz=640)

print("✅ Export complete! Check for yolov8n.onnx in the same folder.")
