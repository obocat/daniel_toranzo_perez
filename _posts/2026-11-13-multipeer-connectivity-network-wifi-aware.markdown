---
title: "Multipeer Connectivity está deprecado: qué cambia y cómo pasar a Network"
title_en: "Multipeer Connectivity is deprecated: what changes and how to move to Network"
date: 2026-11-13 00:00:00
description: "Multipeer Connectivity está deprecado en Xcode 27. Qué implica y cómo migrar a Network framework."
description_en: "Multipeer Connectivity is deprecated in Xcode 27. What it means and how to migrate to Network framework."
lang: es
tags: [iOS, Network, MultipeerConnectivity, Wi-Fi Aware, Networking]
categories: blog
layout: blog
reading_time: 9
---

<div class="lang-es" lang="es" markdown="1">

Multipeer Connectivity fue durante años la forma más rápida de conectar dos dispositivos Apple sin montar un servidor. Descubría dispositivos cercanos, abría una sesión y permitía enviar datos o recursos con relativamente poco código. Ese atajo tiene fecha: Xcode 27 marca todo el framework como deprecado y Apple recomienda migrar a Network framework.

Conviene empezar por lo importante: deprecado no significa eliminado. Las apps que ya usan Multipeer Connectivity siguen funcionando y el framework no desaparece de la noche a la mañana. Lo que cambia es su estatus: deja de ser el camino recomendado, no recibirá nuevas mejoras y cada vez será más difícil justificar usarlo. Apple lo dice de forma explícita en la nota técnica [TN3213](https://developer.apple.com/documentation/technotes/tn3213-moving-from-multipeer-connectivity-to-network-framework).

## Qué ha cambiado exactamente

Xcode 27 marca como obsoleto el framework completo de Multipeer Connectivity. No es una API suelta ni una clase concreta: es el framework entero el que queda marcado como obsoleto en iOS 27, iPadOS 27, macOS 27, tvOS 27 y visionOS 27. Apple pide a los desarrolladores que planifiquen la migración a Network framework.

Eso no convierte a las apps existentes en código que no compila. Si tu app ya está publicada y compila con un SDK anterior, seguirá funcionando. Si compilas con Xcode 27, empezarás a ver avisos de deprecación y tendrás que decidir cuándo abordar el cambio. La pregunta útil no es "¿deja de funcionar hoy?", sino "¿cuánto tiempo más quiero mantener una dependencia que ya no avanza?".

## Network framework: más piezas, más control

Multipeer Connectivity resolvía tres problemas a la vez: descubrir dispositivos, crear una sesión entre ellos y transportar datos. Network framework te da las piezas por separado:

- `NetworkBrowser` descubre servicios Bonjour.
- `NetworkListener` acepta conexiones entrantes.
- `NetworkConnection` abre y gestiona conexiones salientes.
- `TCP`, `TLS` y `QUIC` definen el transporte y la seguridad.

La API nueva de iOS 26 se escribe con `async/await` y builders. La API clásica de Network, con `NWListener`, `NWConnection` y `NWBrowser`, sigue existiendo y permite hacer lo mismo, pero con una mecánica distinta. Para una migración grande, la nota técnica de Apple recomienda la API nueva.

La contrapartida es clara: ya no hay una `MCSession` que lo haga todo por ti. Tienes que decidir la arquitectura, identificar a los dispositivos, deduplicar conexiones y definir el protocolo de mensajes. Es más trabajo, pero también es más fácil entender qué está pasando y adaptarlo a tu app.

## El nuevo entitlement: Wi-Fi Aware

Aquí hay un matiz que conviene no mezclar. Migrar a Network framework no te obliga a usar Wi-Fi Aware. Si solo necesitas TCP o UDP sobre la red local, o Bonjour para descubrir servicios, Network funciona sin ese entitlement.

El entitlement aparece cuando quieres usar Wi-Fi Aware, el transporte que Apple recomienda para peer-to-peer moderno. Wi-Fi Aware permite descubrir, emparejar y conectar dispositivos cercanos sin internet ni punto de acceso, con conexiones autenticadas y cifradas en la capa Wi-Fi. Para usarlo, la app necesita la capacidad `com.apple.developer.wifi-aware`, con un array que incluya `Publish`, `Subscribe` o ambos.

```xml
<!-- App.entitlements -->
<key>com.apple.developer.wifi-aware</key>
<array>
    <string>Publish</string>
    <string>Subscribe</string>
</array>
```

Además, hay que declarar los servicios en el `Info.plist` con la clave `WiFiAwareServices`. Cada servicio indica si se publica, se consume o ambas cosas:

```xml
<!-- Info.plist -->
<key>WiFiAwareServices</key>
<dict>
    <key>_myapp._tcp</key>
    <dict>
        <key>Publishable</key>
        <dict/>
        <key>Subscribable</key>
        <dict/>
    </dict>
</dict>
```

El nombre del servicio tiene reglas estrictas: hasta 15 caracteres, solo letras, números y guiones, sin empezar ni terminar con guion, y con el sufijo `_tcp` o `_udp`. Si el nombre no es válido, la app puede fallar al arrancar. No es un detalle que convenga dejar para el final.

Tampoco es un permiso de runtime que el usuario concede con un diálogo. Es una capacidad de aprovisionamiento: tiene que estar en el perfil de la app. Si tu cuenta no la tiene disponible, tendrás que solicitarla a Apple. Y, antes de conectar, hace falta emparejar los dispositivos con `AccessorySetupKit` o `DeviceDiscoveryUI`.

Wi-Fi Aware está disponible en iOS 26 y iPadOS 26 en modelos compatibles, como iPhone 12 y posteriores o iPad de décima generación y posteriores. Si tu app necesita funcionar en dispositivos más antiguos, tendrás que mantener una ruta alternativa con Network sobre la red local.

## Ventajas que supone el cambio

La primera ventaja es la seguridad. Network framework te permite usar TLS 1.3, QUIC y autenticación mutua, con validación del certificado del otro extremo. En Multipeer Connectivity, la seguridad se configuraba con `MCEncryptionPreference` y era fácil quedarse en una configuración débil o directamente en `.none`. La migración es una buena excusa para corregirlo.

La segunda es el rendimiento y el control. QUIC permite varios streams fiables y un canal de datagramas de mejor esfuerzo sobre la misma conexión. Puedes elegir TCP para un flujo fiable, UDP para baja latencia o QUIC cuando quieres ambas cosas. Además, Wi-Fi Aware puede funcionar a la vez que la Wi-Fi de infraestructura, con conexiones de alta capacidad y baja latencia.

La tercera es la arquitectura. Multipeer Connectivity usaba una red completamente conectada: todos los dispositivos hablaban con todos. Network framework soporta tanto cliente-servidor como malla completa. Para muchas apps, un servidor claro y varios clientes es más fácil de mantener, de depurar y de razonar que una sesión simétrica.

La cuarta es la concurrencia. La API nueva se apoya en `async/await` y en la concurrencia estructurada de Swift. Multipeer Connectivity trabajaba con delegates y colas internas, lo que hacía más fácil acabar con callbacks fuera de orden o con estado compartido difícil de seguir.

La quinta es la privacidad. En lugar de `MCPeerID`, puedes generar un `UUID` como identificador, decidir si lo persistes y rotarlo cuando tenga sentido. También puedes controlar el nombre del servicio Bonjour y los metadatos que publicas en el TXT record. Eso te da más margen para no exponer información estable sobre el dispositivo.

Y la sexta es el futuro. Network framework es la apuesta activa de Apple para networking de bajo nivel. Wi-Fi Aware es un estándar de la Wi-Fi Alliance, no una API propietaria que solo entiende un modelo de iPhone. Si tu app habla con accesorios o con dispositivos de otras plataformas, ese detalle importa.

## Cómo se traduce el código

Un cambio de Multipeer Connectivity a Network no es cambiar un `import`. En Multipeer, una sesión concentraba el descubrimiento, la conexión y el envío. En Network, esas responsabilidades se reparten entre varios tipos.

El ejemplo siguiente es estructural: usa la API de iOS 26 y necesita el SDK de iOS 26 o posterior. No pretende ser una migración completa, sino mostrar el punto de partida.

```swift
import Network

func startListener() async throws {
    try await NetworkListener(
        for: .bonjour(type: "_myapp._tcp")
    ) {
        TCP()
    }
    .run { connection in
        // Gestiona la conexión entrante.
    }
}
```

En el otro extremo, el navegador descubre servicios y devuelve endpoints:

```swift
func browse() async throws {
    try await NetworkBrowser(
        for: .bonjour("_myapp._tcp")
    )
    .run { endpoints in
        // Actualiza la interfaz con los servicios encontrados.
        .continue
    }
}
```

Cuando ya tienes un endpoint, abres la conexión con el protocolo y la seguridad que hayas elegido:

```swift
func connect(to endpoint: NWEndpoint) async throws {
    try await withNetworkConnection(to: endpoint, using: {
        TLS {
            TCP()
        }
        .peerAuthentication(.required)
    }) { connection in
        // Envía y recibe datos.
    }
}
```

El resto del trabajo es el que Multipeer hacía por ti: identificar dispositivos, eliminar conexiones duplicadas, definir el framing de los mensajes y gestionarlos cuando envías datos grandes. La nota técnica de Apple entra en cada uno de esos puntos.

Si quieres usar el peer-to-peer Wi-Fi de Apple sin pasar por Wi-Fi Aware, Network lo activa con `.peerToPeerIncluded(true)`. Apple advierte que ese modo puede consumir más batería y afectar al rendimiento de la red, así que conviene apagarlo en cuanto termines de descubrir o conectar.

## Lo que cuesta la migración

No todo son ventajas. Network framework es más bajo nivel y eso significa más código propio. Multipeer te daba `MCBrowserViewController` y el envío de recursos con `sendResource`; Network no tiene equivalentes directos. Tendrás que construir la interfaz de descubrimiento y transferir archivos por streams, con control de flujo.

También desaparece la comodidad de `MCSession`. Ahora eres tú quien mantiene el mapa de conexiones, quien decide qué hacer con una conexión duplicada y quien cierra las que ya no necesita. Esa responsabilidad es una oportunidad para simplificar la arquitectura, pero no es gratis.

Wi-Fi Aware necesita la capacidad, la declaración de servicios y el emparejamiento previo. Si además usas QUIC con Wi-Fi Aware, ten en cuenta que esa combinación no está soportada antes de iOS 27; en iOS 26 tendrás que elegir otra combinación de protocolos.

## Conclusión

Multipeer Connectivity no desaparece de la noche a la mañana, pero Xcode 27 ya ha puesto el reloj a correr. Si tienes una app en producción que depende de él, el trabajo real no es sustituir una clase por otra: es repensar descubrimiento, conexión, seguridad y transporte.

Mi recomendación es separar la decisión en dos. Primero, decide si necesitas Wi-Fi Aware o si te basta Network sobre Bonjour y TCP/UDP. Después, migra por capas: descubre servicios, abre una conexión, añade TLS y, por último, define el protocolo de mensajes.

La deprecación es una molestia, sí. También es el momento adecuado para quitar una capa que ya no evoluciona y quedarte con una base más explícita, más segura y más fácil de probar.

## Referencias

- [Multipeer Connectivity](https://developer.apple.com/documentation/multipeerconnectivity)
- [TN3213: Moving from Multipeer Connectivity to Network framework](https://developer.apple.com/documentation/technotes/tn3213-moving-from-multipeer-connectivity-to-network-framework)
- [Network framework](https://developer.apple.com/documentation/network)
- [Wi-Fi Aware](https://developer.apple.com/documentation/wifiaware)
- [com.apple.developer.wifi-aware](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.wifi-aware)
- [WiFiAwareServices](https://developer.apple.com/documentation/bundleresources/information-property-list/wifiawareservices)
- [Supercharge device connectivity with Wi-Fi Aware (WWDC25)](https://developer.apple.com/videos/play/wwdc2025/228/)
- [Use structured concurrency with Network framework (WWDC25)](https://developer.apple.com/videos/play/wwdc2025/250/)

</div>

<div class="lang-en" lang="en" markdown="1">

Multipeer Connectivity was for years the fastest way to connect two Apple devices without running a server. It discovered nearby devices, opened a session, and let you send data or resources with relatively little code. That shortcut now has an expiration date: Xcode 27 marks the entire framework as deprecated, and Apple recommends migrating to Network framework.

Let's start with the important part: deprecated does not mean removed. Apps that already use Multipeer Connectivity keep working, and the framework will not disappear overnight. What changes is its status: it is no longer the recommended path, it will not receive new features, and it will become harder to justify using it. Apple says this explicitly in technote [TN3213](https://developer.apple.com/documentation/technotes/tn3213-moving-from-multipeer-connectivity-to-network-framework).

## What exactly changed

Xcode 27 deprecates the entire Multipeer Connectivity framework. This is not a single API or a specific class: the whole framework is marked as obsolete across iOS 27, iPadOS 27, macOS 27, tvOS 27, and visionOS 27. Apple asks developers to plan their migration to Network framework.

That does not turn existing apps into code that does not compile. If your app is already shipped and builds with an older SDK, it will keep working. If you build with Xcode 27, you will start seeing deprecation warnings and will have to decide when to tackle the change. The useful question is not "does it stop working today?" but "how long do I want to maintain a dependency that is no longer moving forward?".

## Network framework: more pieces, more control

Multipeer Connectivity solved three problems at once: discovering devices, creating a session between them, and transporting data. Network framework gives you the pieces separately:

- `NetworkBrowser` discovers Bonjour services.
- `NetworkListener` accepts incoming connections.
- `NetworkConnection` opens and manages outgoing connections.
- `TCP`, `TLS`, and `QUIC` define the transport and security.

The new iOS 26 API uses `async/await` and builders. The classic Network API, with `NWListener`, `NWConnection`, and `NWBrowser`, still exists and can do the same things, but with different mechanics. For a large migration, Apple's technote recommends the new API.

The trade-off is clear: there is no longer an `MCSession` that does everything for you. You have to choose the architecture, identify devices, deduplicate connections, and define the message protocol. It is more work, but it is also easier to understand what is happening and to adapt it to your app.

## The new entitlement: Wi-Fi Aware

There is a distinction worth keeping straight. Migrating to Network framework does not force you to use Wi-Fi Aware. If you only need TCP or UDP on the local network, or Bonjour for service discovery, Network works without that entitlement.

The entitlement appears when you want to use Wi-Fi Aware, the transport Apple recommends for modern peer-to-peer. Wi-Fi Aware lets nearby devices discover, pair, and connect without the internet or an access point, with connections authenticated and encrypted at the Wi-Fi layer. To use it, the app needs the `com.apple.developer.wifi-aware` capability, with an array that includes `Publish`, `Subscribe`, or both.

```xml
<!-- App.entitlements -->
<key>com.apple.developer.wifi-aware</key>
<array>
    <string>Publish</string>
    <string>Subscribe</string>
</array>
```

You also need to declare the services in `Info.plist` under the `WiFiAwareServices` key. Each service states whether it is published, consumed, or both:

```xml
<!-- Info.plist -->
<key>WiFiAwareServices</key>
<dict>
    <key>_myapp._tcp</key>
    <dict>
        <key>Publishable</key>
        <dict/>
        <key>Subscribable</key>
        <dict/>
    </dict>
</dict>
```

Service names have strict rules: up to 15 characters, only letters, numbers, and hyphens, no leading or trailing hyphen, and a `_tcp` or `_udp` suffix. If the name is invalid, the app can crash at launch. This is not a detail to leave for the end.

It is also not a runtime permission that the user grants in a dialog. It is a provisioning capability: it has to be in the app's profile. If your account does not have it available, you will need to request it from Apple. And before connecting, devices need to be paired using `AccessorySetupKit` or `DeviceDiscoveryUI`.

Wi-Fi Aware is available in iOS 26 and iPadOS 26 on supported models, such as iPhone 12 and later or iPad (10th generation) and later. If your app needs to support older devices, you will need to keep an alternative path using Network over the local network.

## The advantages of moving

The first advantage is security. Network framework lets you use TLS 1.3, QUIC, and mutual authentication, with validation of the other peer's certificate. In Multipeer Connectivity, security was configured with `MCEncryptionPreference`, and it was easy to end up with a weak configuration or even `.none`. A migration is a good excuse to fix that.

The second is performance and control. QUIC supports multiple reliable streams and a best-effort datagram channel over the same connection. You can choose TCP for a reliable stream, UDP for low latency, or QUIC when you want both. Wi-Fi Aware can also run alongside infrastructure Wi-Fi, with high-throughput, low-latency connections.

The third is architecture. Multipeer Connectivity used a fully connected network: every peer talked to every other peer. Network framework supports both client-server and full mesh. For many apps, a clear server and several clients are easier to maintain, debug, and reason about than a symmetric session.

The fourth is concurrency. The new API relies on `async/await` and Swift's structured concurrency. Multipeer Connectivity worked with delegates and internal queues, which made it easy to end up with out-of-order callbacks or hard-to-follow shared state.

The fifth is privacy. Instead of `MCPeerID`, you can generate a `UUID` as an identifier, decide whether to persist it, and rotate it when it makes sense. You can also control the Bonjour service name and the metadata you publish in the TXT record. That gives you more room to avoid exposing stable information about the device.

And the sixth is the future. Network framework is Apple's active bet for low-level networking. Wi-Fi Aware is a Wi-Fi Alliance standard, not a proprietary API that only one iPhone model understands. If your app talks to accessories or devices on other platforms, that matters.

## What the code looks like

Moving from Multipeer Connectivity to Network is not an `import` change. In Multipeer, one session centralized discovery, connection, and sending. In Network, those responsibilities are split across several types.

The following example is structural: it uses the iOS 26 API and requires the iOS 26 SDK or later. It is not a complete migration, just a starting point.

```swift
import Network

func startListener() async throws {
    try await NetworkListener(
        for: .bonjour(type: "_myapp._tcp")
    ) {
        TCP()
    }
    .run { connection in
        // Handle the incoming connection.
    }
}
```

On the other side, the browser discovers services and returns endpoints:

```swift
func browse() async throws {
    try await NetworkBrowser(
        for: .bonjour("_myapp._tcp")
    )
    .run { endpoints in
        // Update the UI with the discovered services.
        .continue
    }
}
```

Once you have an endpoint, you open the connection with the protocol and security you chose:

```swift
func connect(to endpoint: NWEndpoint) async throws {
    try await withNetworkConnection(to: endpoint, using: {
        TLS {
            TCP()
        }
        .peerAuthentication(.required)
    }) { connection in
        // Send and receive data.
    }
}
```

The rest is the work Multipeer used to do for you: identifying devices, removing duplicate connections, defining message framing, and managing them when you send large payloads. Apple's technote covers each of those points.

If you want Apple's peer-to-peer Wi-Fi without going through Wi-Fi Aware, Network enables it with `.peerToPeerIncluded(true)`. Apple warns that this mode can use more battery and affect network performance, so it should be turned off as soon as discovery or connection is done.

## What the migration costs

It is not all advantages. Network framework is lower level, which means more code of your own. Multipeer gave you `MCBrowserViewController` and resource sending with `sendResource`; Network has no direct equivalents. You will need to build the discovery UI and transfer files over streams, with flow control.

The convenience of `MCSession` is also gone. You now own the connection map, decide what to do with a duplicate connection, and close the ones you no longer need. That responsibility is an opportunity to simplify the architecture, but it is not free.

Wi-Fi Aware needs the capability, the service declarations, and prior pairing. And if you use QUIC with Wi-Fi Aware, note that the combination is not supported before iOS 27; on iOS 26 you will need a different protocol combination.

## Conclusion

Multipeer Connectivity will not disappear overnight, but Xcode 27 has already started the clock. If you have a production app that depends on it, the real work is not replacing one class with another: it is rethinking discovery, connection, security, and transport.

My recommendation is to split the decision in two. First, decide whether you need Wi-Fi Aware or whether Network over Bonjour and TCP/UDP is enough. Then migrate in layers: discover services, open a connection, add TLS, and finally define the message protocol.

The deprecation is annoying, yes. It is also the right time to remove a layer that no longer evolves and keep a foundation that is more explicit, more secure, and easier to test.

## References

- [Multipeer Connectivity](https://developer.apple.com/documentation/multipeerconnectivity)
- [TN3213: Moving from Multipeer Connectivity to Network framework](https://developer.apple.com/documentation/technotes/tn3213-moving-from-multipeer-connectivity-to-network-framework)
- [Network framework](https://developer.apple.com/documentation/network)
- [Wi-Fi Aware](https://developer.apple.com/documentation/wifiaware)
- [com.apple.developer.wifi-aware](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.wifi-aware)
- [WiFiAwareServices](https://developer.apple.com/documentation/bundleresources/information-property-list/wifiawareservices)
- [Supercharge device connectivity with Wi-Fi Aware (WWDC25)](https://developer.apple.com/videos/play/wwdc2025/228/)
- [Use structured concurrency with Network framework (WWDC25)](https://developer.apple.com/videos/play/wwdc2025/250/)

</div>
