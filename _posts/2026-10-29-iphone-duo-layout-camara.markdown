---
title: "Adaptar una app al iPhone Duo: layouts fáciles, cámara difícil"
title_en: "Adapting an app to iPhone Duo: easy layouts, hard camera"
date: 2026-10-29 00:00:00
description: "Cómo adaptamos una app al iPhone Duo con ArrangementView y AVCaptureDevice.RotationCoordinator."
description_en: "How we adapted an app to iPhone Duo with ArrangementView and AVCaptureDevice.RotationCoordinator."
lang: es
tags: [iOS, iPhone Duo, AVFoundation, SwiftUI, Camera]
categories: blog
layout: blog
reading_time: 8
---

<div class="lang-es" lang="es" markdown="1">

Cuando Apple presentó el iPhone Duo, la primera pregunta fue cuánto trabajo nos costaría adaptar la app. La respuesta corta: los layouts, mucho menos de lo esperado; la cámara, bastante más. No porque la API fuera especialmente complicada, sino porque el problema solo aparece cuando el dispositivo cambia de forma delante de ti.

## Un iPhone que no es solo un iPhone más grande

El Duo tiene dos pantallas, una exterior y otra interior, y puede estar cerrado, abierto o parcialmente plegado. Al abrirlo, la app puede pasar de una pantalla a la otra, la geometría cambia y los controles del sistema pueden reorganizarse. Además, la cámara que está mirando hacia el usuario puede cambiar de dirección.

Eso rompe una suposición muy cómoda que arrastrábamos de iOS: que la orientación de la interfaz y la orientación de la cámara eran dos cosas más o menos equivalentes. En un plegable, la app puede cambiar de pantalla sin que haya una rotación clásica, y la cámara puede seguir apuntando hacia otro sitio.

## Los layouts: ArrangementView hizo casi todo el trabajo

Para la estructura principal usamos `ArrangementView`, el contenedor que Apple añadió para organizar una vista primaria y una secundaria según la pose del dispositivo. En UIKit existe el equivalente `UIArrangementViewController`.

La idea es sencilla:

```swift
ArrangementView {
    LibraryView()
} secondary: {
    DetailView()
}
.arrangementViewStyle(.split.axes(.horizontal))
```

El estilo `split` coloca las dos vistas lado a lado cuando el contenedor es más ancho que alto, y las apila cuando es más alto que ancho. Además, tiene en cuenta regiones reservadas como el pliegue. El estilo `overlay` funciona de forma parecida a un `ZStack`: cuando el dispositivo está cerrado o completamente abierto coloca la vista primaria sobre la secundaria, y cuando está parcialmente plegado las separa alrededor del pliegue.

En nuestro caso, la primera aproximación fue bastante trivial. Pasamos de una pantalla única a una jerarquía primaria/secundaria y el sistema resolvió la mayor parte de los cambios de tamaño y de posición. Lo que quedó fue ajustar detalles: qué vista tenía prioridad en cada pose, dónde colocar los controles y cómo evitar que algo importante cayera justo en el pliegue o debajo de la cámara interior.

Para eso último no conviene inventarse el cálculo del pliegue. Apple expone las regiones reservadas:

```swift
GeometryReader { proxy in
    let divisions = proxy.reservedRegions(kind: .division)
    let occlusions = proxy.reservedRegions(kind: .occlusion)

    // Ajustar el contenido según las regiones activas.
}
```

La recomendación es usar el tamaño real de la escena o del contenedor, no dimensiones fijas de iPhone, y no tomar decisiones de layout a partir de `UIInterfaceOrientation`. En un Duo, la orientación clásica no cuenta toda la historia.

También hay que tener cuidado con dónde se coloca un `ArrangementView`: no debe ir dentro de un `NavigationSplitView`, una lista, un scroll view o cualquier contenedor que pueda dejar parte de la vista inaccesible.

## La cámara: el problema que no se veía en el simulador

El layout se podía validar bastante bien en el simulador. La cámara, no.

El síntoma aparecía al abrir el dispositivo: la preview cambiaba de orientación y no siempre quedaba nivelada. El contenido se redimensionaba, la capa de preview pasaba a otra pantalla y la rotación dejaba de ser la esperada. En el simulador el layout se veía correcto; el problema real necesitaba un Duo en la mano.

La causa de fondo es que el sensor de una cámara tiene una orientación física fija. La rotación del dispositivo no cambia el sensor, y el pipeline de captura no compensa esa diferencia por su cuenta. En un iPhone normal suele bastar con observar la orientación de la interfaz, pero en un plegable hay cambios de pantalla y de pose que no encajan en ese modelo.

La solución no fue calcular ángulos a mano. Fue usar `AVCaptureDevice.RotationCoordinator` como única fuente de verdad.

## RotationCoordinator: ángulos relativos al horizonte

`AVCaptureDevice.RotationCoordinator` monitoriza la orientación física de un dispositivo de captura y proporciona ángulos de ajuste para mantener las imágenes niveladas con respecto a la gravedad.

La API existe desde iOS 17, así que no es exclusiva del Duo; lo que cambia es que aquí pasa a ser la pieza central.

El coordinador publica dos ángulos:

- `videoRotationAngleForHorizonLevelPreview`: para la capa de preview.
- `videoRotationAngleForHorizonLevelCapture`: para las fotos y los vídeos capturados.

El de preview tiene en cuenta además la posición de la capa dentro de la jerarquía de vistas. Por eso puede ser distinto del de captura. En el Duo, ambos se actualizan cuando la app cambia de pantalla.

El coordinador se crea con el dispositivo y la capa de preview:

```swift
let coordinator = AVCaptureDevice.RotationCoordinator(
    device: device,
    previewLayer: previewLayer
)
```

Hay tres detalles que fueron clave para que funcionara de verdad:

1. **La capa tiene que estar en una ventana.** El coordinador mide su posición en la jerarquía. Si se crea con `previewLayer: nil`, nunca dará un ángulo de preview, aunque la capa aparezca después.
2. **Hay que recrear el coordinador cuando cambia la cámara o la capa.** Un coordinador está ligado a un dispositivo durante toda su vida. Si pasamos de la cámara interior a la exterior, o la capa se mueve a otra ventana, hay que crear uno nuevo.
3. **Hay que leer los valores iniciales y luego observar los cambios.** Si solo observas, la preview puede quedarse torcida hasta la primera rotación.

Un observador mínimo podría quedar así:

```swift
@MainActor
final class CameraRotationObserver {
    private var coordinator: AVCaptureDevice.RotationCoordinator?
    private var observations = [NSKeyValueObservation]()
    private var device: AVCaptureDevice?
    private weak var previewLayer: AVCaptureVideoPreviewLayer?

    func setDevice(_ device: AVCaptureDevice) {
        self.device = device
        restart()
    }

    func setPreviewLayer(_ layer: AVCaptureVideoPreviewLayer) {
        previewLayer = layer
        restart()
    }

    private func restart() {
        guard let device else { return }

        observations.forEach { $0.invalidate() }
        observations.removeAll()

        let coordinator = AVCaptureDevice.RotationCoordinator(
            device: device,
            previewLayer: previewLayer
        )
        self.coordinator = coordinator

        applyPreview(coordinator.videoRotationAngleForHorizonLevelPreview)
        applyCapture(coordinator.videoRotationAngleForHorizonLevelCapture)

        observations.append(
            coordinator.observe(
                \.videoRotationAngleForHorizonLevelPreview,
                options: .new
            ) { [weak self] _, change in
                guard let angle = change.newValue else { return }
                MainActor.assumeIsolated {
                    self?.applyPreview(angle)
                }
            }
        )

        observations.append(
            coordinator.observe(
                \.videoRotationAngleForHorizonLevelCapture,
                options: .new
            ) { [weak self] _, change in
                guard let angle = change.newValue else { return }
                MainActor.assumeIsolated {
                    self?.applyCapture(angle)
                }
            }
        )
    }

    private func applyPreview(_ angle: CGFloat) {
        previewLayer?.connection?.videoRotationAngle = angle
    }

    private func applyCapture(_ angle: CGFloat) {
        // Enviar el ángulo al actor que posee la sesión de captura.
    }
}
```

Aplicar el ángulo de preview es una sola línea:

```swift
previewLayer.connection?.videoRotationAngle = angle
```

Para la captura, el ángulo se aplica a la conexión de vídeo de cada output:

```swift
output.connection(with: .video)?.videoRotationAngle = angle
```

## El detalle de la capa de preview

En SwiftUI, la capa de preview suele vivir dentro de un `UIViewRepresentable`. Esa vista se construye antes de que el sistema la instale en una ventana. Por eso conviene avisar al observador cuando la capa se mueve a una ventana:

```swift
final class PreviewView: UIView {
    var previewLayerDidMoveToWindow: ((AVCaptureVideoPreviewLayer) -> Void)?

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil else { return }
        previewLayerDidMoveToWindow?(previewLayer)
    }
}
```

Ese callback es el que recrea el coordinador con la capa ya instalada. En un Duo, además, la app puede moverse entre pantallas, así que este tipo de transición no es un caso raro: es parte del funcionamiento normal.

## Si usas las cámaras físicas, hay otra pieza

El Duo tiene una cámara frontal exterior y otra interior. Si usas la cámara frontal virtual, el sistema se encarga de cambiar entre ambas al abrir y cerrar el dispositivo. Si accedes a las cámaras físicas por separado, necesitas además `AVCaptureDeviceDirectionCoordinator`, que te dice qué cámara mira hacia la misma dirección que tu vista.

Ese coordinador es de AVKit, trabaja en el main actor y entrega `AVCaptureDeviceDescriptor`, no objetos `AVCaptureDevice`. La idea es no tocar AVFoundation desde el change handler: se pasa el descriptor al actor que posee la sesión y allí se resuelve y se reconfigura la entrada.

No era nuestro problema principal, pero encaja con la misma lección: en un plegable, la posición de la cámara ya no basta para saber hacia dónde apunta.

## Lo que el simulador no te cuenta

El simulador sirve para validar layouts, tamaños, barras y poses. Para la cámara hace falta un dispositivo físico. Nuestra lista de pruebas fue algo así:

- Cerrar, abrir y dejar el Duo parcialmente plegado con la cámara activa.
- Rotar en cada pose: vertical, horizontal, tipo tienda de campaña y tipo portátil.
- Cambiar entre cámara interior, exterior y trasera.
- Verificar que la preview no salta al pasar de una pantalla a otra.

El problema era difícil precisamente por esto: no era un bug de lógica pura, era un bug de estado físico. La misma configuración podía fallar solo en una pose concreta y solo durante una fracción de segundo.

## Conclusión

Adaptar los layouts al iPhone Duo fue mucho más sencillo de lo que esperaba. `ArrangementView` y las regiones reservadas resolvieron la mayor parte del trabajo, y la primera aproximación funcionó casi sola.

La cámara fue otra historia. La clave fue dejar de pensar en términos de orientación de interfaz y usar `AVCaptureDevice.RotationCoordinator` como fuente de verdad, recreándolo cuando cambia el dispositivo o la capa de preview. Ahí se acabó el baile de ángulos al abrir el dispositivo.

Si estás adaptando una app al Duo, empezaría por el layout y dedicaría tiempo aparte a la cámara. Y, sobre todo, probaría en un dispositivo físico: hay cosas que el simulador simplemente no te puede contar.

## Referencias

- [Preparing your app for iPhone Duo](https://developer.apple.com/documentation/technologyoverviews/preparing-your-app-for-iphone-duo)
- [Build a great camera experience for iPhone Duo](https://developer.apple.com/videos/play/tech-talks/111465/)
- [Choosing a camera by the direction it faces](https://developer.apple.com/documentation/avkit/choosing-a-camera-by-the-direction-it-faces)
- [Supporting device rotation in your camera app](https://developer.apple.com/documentation/avfoundation/supporting-device-rotation-in-your-camera-app)
- [AVCaptureDevice.RotationCoordinator](https://developer.apple.com/documentation/avfoundation/avcapturedevice/rotationcoordinator)

</div>

<div class="lang-en" lang="en" markdown="1">

When Apple announced iPhone Duo, the first question was how much work it would take to adapt the app. The short answer: layouts were much easier than expected; the camera was much harder. Not because the API was especially complicated, but because the problem only shows up when the device changes shape in front of you.

## An iPhone that is not just a bigger iPhone

Duo has two displays, one on the outside and one on the inside, and it can be closed, open, or partially folded. When it opens, the app can move from one display to the other, the geometry changes, and system controls may rearrange. The camera facing the user can also change direction.

That breaks a very convenient assumption we had carried over from iOS: that interface orientation and camera orientation were more or less equivalent. On a foldable, the app can change displays without a classic rotation, and the camera may still be pointing somewhere else.

## Layouts: ArrangementView did most of the work

For the main structure we used `ArrangementView`, the container Apple added to arrange a primary and a secondary view according to the device pose. UIKit has the equivalent `UIArrangementViewController`.

The idea is simple:

```swift
ArrangementView {
    LibraryView()
} secondary: {
    DetailView()
}
.arrangementViewStyle(.split.axes(.horizontal))
```

The `split` style places both views side by side when the container is wider than it is tall, and stacks them when it is taller than it is wide. It also accounts for reserved regions such as the fold. The `overlay` style works more like a `ZStack`: when the device is closed or fully open it places the primary view over the secondary one, and when partially folded it separates them around the fold.

In our case, the first pass was pretty trivial. We moved from a single screen to a primary/secondary hierarchy and the system handled most of the resizing and positioning. What remained was tuning details: which view had priority in each pose, where to put controls, and how to keep important content away from the fold or the inner camera.

For the latter, don't invent your own fold math. Apple exposes reserved regions:

```swift
GeometryReader { proxy in
    let divisions = proxy.reservedRegions(kind: .division)
    let occlusions = proxy.reservedRegions(kind: .occlusion)

    // Adjust content based on active regions.
}
```

The recommendation is to use the actual scene or container size, not fixed iPhone dimensions, and not to make layout decisions from `UIInterfaceOrientation`. On a Duo, classic orientation doesn't tell the whole story.

Also be careful where you place an `ArrangementView`: it should not go inside a `NavigationSplitView`, a list, a scroll view, or any container that might make part of the view inaccessible.

## The camera: the problem the simulator didn't show

The layout could be validated pretty well in the simulator. The camera could not.

The symptom appeared when opening the device: the preview changed orientation and did not always end up level. The content resized, the preview layer moved to another display, and the rotation was no longer what we expected. In the simulator the layout looked right; the real problem needed a Duo in hand.

The root cause is that a camera sensor has a fixed physical orientation. Rotating the device does not change the sensor, and the capture pipeline does not compensate for that difference on its own. On a regular iPhone it is often enough to observe interface orientation, but on a foldable there are display and pose changes that don't fit that model.

The solution was not to calculate angles by hand. It was to use `AVCaptureDevice.RotationCoordinator` as the single source of truth.

## RotationCoordinator: angles relative to the horizon

`AVCaptureDevice.RotationCoordinator` monitors the physical orientation of a capture device and provides adjustment angles to keep images level, relative to gravity.

The API has existed since iOS 17, so it isn't exclusive to Duo; what changes is that here it becomes the central piece.

The coordinator publishes two angles:

- `videoRotationAngleForHorizonLevelPreview`: for the preview layer.
- `videoRotationAngleForHorizonLevelCapture`: for captured photos and videos.

The preview angle also takes into account the layer's position in the view hierarchy, so it can differ from the capture angle. On Duo, both update when the app moves between displays.

Create the coordinator with the device and the preview layer:

```swift
let coordinator = AVCaptureDevice.RotationCoordinator(
    device: device,
    previewLayer: previewLayer
)
```

Three details were key to making it work for real:

1. **The layer must be in a window.** The coordinator measures its position in the hierarchy. If you create it with `previewLayer: nil`, it will never report a preview angle, even if the layer appears later.
2. **Recreate the coordinator when the camera or layer changes.** A coordinator is bound to one device for its lifetime. If we switch from the inner to the outer camera, or the layer moves to another window, we need a new one.
3. **Read the initial values, then observe changes.** If you only observe, the preview may stay rotated until the first rotation.

A minimal observer could look like this:

```swift
@MainActor
final class CameraRotationObserver {
    private var coordinator: AVCaptureDevice.RotationCoordinator?
    private var observations = [NSKeyValueObservation]()
    private var device: AVCaptureDevice?
    private weak var previewLayer: AVCaptureVideoPreviewLayer?

    func setDevice(_ device: AVCaptureDevice) {
        self.device = device
        restart()
    }

    func setPreviewLayer(_ layer: AVCaptureVideoPreviewLayer) {
        previewLayer = layer
        restart()
    }

    private func restart() {
        guard let device else { return }

        observations.forEach { $0.invalidate() }
        observations.removeAll()

        let coordinator = AVCaptureDevice.RotationCoordinator(
            device: device,
            previewLayer: previewLayer
        )
        self.coordinator = coordinator

        applyPreview(coordinator.videoRotationAngleForHorizonLevelPreview)
        applyCapture(coordinator.videoRotationAngleForHorizonLevelCapture)

        observations.append(
            coordinator.observe(
                \.videoRotationAngleForHorizonLevelPreview,
                options: .new
            ) { [weak self] _, change in
                guard let angle = change.newValue else { return }
                MainActor.assumeIsolated {
                    self?.applyPreview(angle)
                }
            }
        )

        observations.append(
            coordinator.observe(
                \.videoRotationAngleForHorizonLevelCapture,
                options: .new
            ) { [weak self] _, change in
                guard let angle = change.newValue else { return }
                MainActor.assumeIsolated {
                    self?.applyCapture(angle)
                }
            }
        )
    }

    private func applyPreview(_ angle: CGFloat) {
        previewLayer?.connection?.videoRotationAngle = angle
    }

    private func applyCapture(_ angle: CGFloat) {
        // Send the angle to the actor that owns the capture session.
    }
}
```

Applying the preview angle is a single line:

```swift
previewLayer.connection?.videoRotationAngle = angle
```

For capture, apply the angle to each output's video connection:

```swift
output.connection(with: .video)?.videoRotationAngle = angle
```

## The preview layer detail

In SwiftUI, the preview layer usually lives inside a `UIViewRepresentable`. That view is built before the system installs it in a window. So it's worth notifying the observer when the layer moves to a window:

```swift
final class PreviewView: UIView {
    var previewLayerDidMoveToWindow: ((AVCaptureVideoPreviewLayer) -> Void)?

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil else { return }
        previewLayerDidMoveToWindow?(previewLayer)
    }
}
```

That callback recreates the coordinator with the layer already installed. On a Duo, the app can also move between displays, so this kind of transition is not an edge case: it's part of normal operation.

## If you use the physical cameras, there is another piece

Duo has an outer front camera and an inner front camera. If you use the virtual front camera, the system switches between them when the device opens and closes. If you access the physical cameras individually, you also need `AVCaptureDeviceDirectionCoordinator`, which tells you which camera faces the same direction as your view.

That coordinator is part of AVKit, runs on the main actor, and delivers `AVCaptureDeviceDescriptor`, not `AVCaptureDevice` objects. The idea is not to touch AVFoundation from the change handler: pass the descriptor to the actor that owns the session, resolve it there, and reconfigure the input.

It wasn't our main problem, but it fits the same lesson: on a foldable, the camera's position is no longer enough to know where it is pointing.

## What the simulator doesn't tell you

The simulator is useful for validating layouts, sizes, bars, and poses. The camera requires a physical device. Our test list looked something like this:

- Close, open, and leave the Duo partially folded with the camera active.
- Rotate in every pose: portrait, landscape, tent, and laptop.
- Switch between inner, outer, and rear cameras.
- Verify that the preview doesn't jump when moving from one display to the other.

The problem was hard precisely because of this: it wasn't a pure logic bug, it was a physical-state bug. The same configuration could fail only in a specific pose and only for a fraction of a second.

## Conclusion

Adapting layouts to iPhone Duo was much easier than expected. `ArrangementView` and reserved regions handled most of the work, and the first pass worked almost by itself.

The camera was a different story. The key was to stop thinking in terms of interface orientation and use `AVCaptureDevice.RotationCoordinator` as the source of truth, recreating it when the device or preview layer changes. That's when the angle dance on opening the device stopped.

If you're adapting an app to Duo, I'd start with the layout and set aside separate time for the camera. And above all, test on a physical device: there are things the simulator simply cannot tell you.

## References

- [Preparing your app for iPhone Duo](https://developer.apple.com/documentation/technologyoverviews/preparing-your-app-for-iphone-duo)
- [Build a great camera experience for iPhone Duo](https://developer.apple.com/videos/play/tech-talks/111465/)
- [Choosing a camera by the direction it faces](https://developer.apple.com/documentation/avkit/choosing-a-camera-by-the-direction-it-faces)
- [Supporting device rotation in your camera app](https://developer.apple.com/documentation/avfoundation/supporting-device-rotation-in-your-camera-app)
- [AVCaptureDevice.RotationCoordinator](https://developer.apple.com/documentation/avfoundation/avcapturedevice/rotationcoordinator)

</div>
