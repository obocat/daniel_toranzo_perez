---
title: "autoreleasepool en Swift: cuando ARC no es suficiente"
title_en: "autoreleasepool in Swift: when ARC is not enough"
date: 2026-11-23 09:00:00 +0100
description: "Por qué un bucle con APIs de Objective-C puede disparar la memoria aunque uses ARC, y cómo usar autoreleasepool para acotar el pico."
description_en: "Why a loop using Objective-C APIs can spike memory even with ARC, and how to use autoreleasepool to bound the peak."
lang: es
tags: [iOS, Swift, Memory, ARC, Performance]
categories: blog
layout: blog
reading_time: 7
---

<div class="lang-es" lang="es" markdown="1">

Imagina una carpeta con miles de fotos. El código recorre los archivos, carga cada imagen, la recomprime y la guarda. Cada iteración es independiente. La memoria debería quedarse plana. En su lugar, sube, sube y la app termina muriendo. No hay un retain cycle evidente. No hay un array gigante. El culpable está una capa más abajo: el autorelease pool de Objective-C.

Este es el patrón que suele aparecer:

```swift
import UIKit

func reencodeImagesWithoutPool(from urls: [URL], to directory: URL) throws {
    for url in urls {
        guard let image = UIImage(contentsOfFile: url.path),
              let data = image.jpegData(compressionQuality: 0.8) else {
            continue
        }

        let filename = url.deletingPathExtension().lastPathComponent + ".jpg"
        try data.write(to: directory.appendingPathComponent(filename))
    }
}
```

El código parece correcto. `image` y `data` son referencias locales; cuando termina la iteración, no deberían quedar vivas. Pero ARC no es el único sistema de memoria que está trabajando aquí.

## Lo que ARC sí garantiza

En Swift, un objeto empieza a vivir en su inicialización y su vida garantizada termina en su último uso. El compilador inserta operaciones `retain` y `release`; según las optimizaciones, el objeto puede liberarse justo después de ese último uso o más tarde. La garantía es el mínimo, no el instante exacto. Es distinto de C++, donde el cierre del bloque marca el final de la vida del objeto.

Apple lo explica en la sesión [ARC in Swift: Basics and beyond](https://developer.apple.com/videos/play/wwdc2021/10216/) de la WWDC21. La idea de que «Swift ya libera todo justo cuando ya no hace falta» es media verdad: ARC suele acercarse al último uso, pero no es un recolector de basura y no promete liberar en la línea exacta que tú imaginas.

> **Matiz:** ARC garantiza que un objeto vive al menos hasta su último uso. No garantiza que muera exactamente ahí. Y los objetos que Objective-C envía a `autorelease` no siguen las reglas de ARC de Swift.
{: .doc-callout .doc-callout--note}

Para objetos puramente Swift, `autoreleasepool` normalmente no hace nada: no hay ningún `autorelease` que drenar. El problema aparece cuando el bucle llama a APIs de Foundation o UIKit que, por debajo, siguen siendo Objective-C.

## La capa que sigue siendo Objective-C

Cuando un objeto recibe `autorelease`, no se libera en ese momento. Se apunta en el pool actual. Cuando el pool se drena, recibe un `release` por cada `autorelease` que recibió dentro de ese bloque.

UIKit y AppKit crean un pool al principio de cada iteración del run loop y lo drenan al final. Por eso, en una acción normal de la interfaz, no tienes que preocuparte: el sistema ya está haciendo el trabajo. El problema es que tu bucle puede ejecutarse entero dentro de una sola iteración del run loop. Todo lo que se autorelease dentro se acumula hasta que terminas el lote.

La guía de memoria de Apple lo dice de forma explícita: si escribes un bucle que crea muchos objetos temporales, puedes usar un pool dentro del bucle para reducir el pico de memoria. También recomienda crear uno al empezar un hilo secundario. No es una reliquia de la época manual: Foundation y UIKit siguen siendo Objective-C en gran parte, y algunas APIs modernas puentean a Objective-C según la versión del sistema o los argumentos que reciben.

> **Ojo:** no hay una lista fiable de qué APIs usan `autorelease` por dentro. Hasta una API aparentemente Swift como `Data(contentsOf:)` se ha comportado distinto entre versiones. La regla no es memorizar nombres: es medir y acotar cuando veas el patrón.
{: .doc-callout .doc-callout--important}

En Darwin, Swift Concurrency envuelve cada job en un pool, y RunLoop también. GCD permite configurar la frecuencia del pool por cola, incluido un pool por bloque. Eso no te salva si un job largo contiene un bucle que crea miles de temporales: el pool del job no se drena hasta que el job termina.

## El arreglo: un pool por iteración

La versión con `autoreleasepool` cambia muy poco:

```swift
import UIKit

func reencodeImages(from urls: [URL], to directory: URL) throws {
    for url in urls {
        try autoreleasepool {
            guard let image = UIImage(contentsOfFile: url.path),
                  let data = image.jpegData(compressionQuality: 0.8) else {
                return
            }

            let filename = url.deletingPathExtension().lastPathComponent + ".jpg"
            try data.write(to: directory.appendingPathComponent(filename))
        }
    }
}
```

El cuerpo de la iteración vive dentro del pool. Al terminar el bloque, los objetos autoreleased de esa iteración reciben su `release`. El `return` sale del closure, no de la función; la siguiente iteración continúa. Si el cuerpo lanza un error, `try` lo propaga; no necesitas un `do/catch` solo para el pool.

`autoreleasepool` no es una palabra clave: es una función del módulo `ObjectiveC` que Foundation y UIKit reexportan. En una app con UIKit ya la tienes disponible; en un archivo suelto necesitas `import Foundation`, `import UIKit` o `import ObjectiveC`.

El pool va **dentro** del bucle, no alrededor. Este pseudocódigo no sirve:

```swift
autoreleasepool {
    for url in urls {
        // ...
    }
}
```

Ahí el pool se drena al final del lote, justo cuando ya no importa. La unidad que quieres acotar es la iteración, no la operación completa.

Si necesitas un resultado, devuelve solo lo pequeño:

```swift
import UIKit

func imageSizes(at urls: [URL]) -> [CGSize] {
    urls.compactMap { url in
        autoreleasepool {
            UIImage(contentsOfFile: url.path)?.size
        }
    }
}
```

Si devuelves la imagen o el `Data` grande, el pool no puede hacer magia: el valor sigue vivo en el scope exterior. `autoreleasepool` libera temporales, no referencias fuertes que tú conservas.

## Lo que autoreleasepool no arregla

- **Un array que acumula todas las imágenes.** El array es una referencia fuerte; el pico es tuyo. El pool no reduce la memoria de algo que sigues reteniendo.
- **Un retain cycle.** El objeto no se libera nunca; el pool no rompe ciclos.
- **Una caché.** `UIImage(named:)`, `NSCache` y compañía retienen objetos a propósito.
- **Un pool alrededor de todo el bucle.** Drena demasiado tarde.
- **Código Swift puro.** Si no hay `autorelease`, no hay nada que drenar.
- **Un leak real de ImageIO o UIKit.** Si el pico sigue después del pool, necesitas el memory graph y Instruments.

La tabla rápida:

| Situación | Qué hacer |
| --- | --- |
| Bucle con `UIImage`, `NSImage`, `NSAttributedString` o similar | `autoreleasepool` por iteración |
| Modelo o struct Swift puro | Nada; ARC se encarga |
| Array que retiene todos los resultados | Rediseña; el pool no reduce el pico |
| Hilo propio largo | Pool al inicio y/o por iteración |
| Retain cycle o caché | Memory graph; el pool no lo arregla |
| Pico medido en Instruments | Prueba el pool y vuelve a medir |

## Cómo comprobarlo

Empieza por el memory report de Xcode: te da la forma del pico y te dice si crece con el lote. Para saber quién lo causa, abre Instruments y usa el instrumento Allocations. Marca generaciones antes y después de una iteración o de un lote, y compara con y sin pool. Lo que buscas no es solo la memoria retenida al final, sino el pico transitorio que puede hacer que iOS termine la app.

Si quieres una prueba automática, `XCTMemoryMetric` mide el uso de memoria durante un bloque. Es útil para detectar regresiones de memoria retenida, pero para picos transitorios el instrumento Allocations es más directo. No pongas un umbral basado en una sola ejecución: la memoria varía entre dispositivos y versiones.

Y no optimices a ciegas. `autoreleasepool` tiene un coste pequeño de push/pop; úsalo donde hay muchos temporales de Objective-C, no en cada función por si acaso.

## La regla práctica

Si un bucle crea y descarta objetos de Objective-C, dale a cada iteración su propio pool. No es una optimización prematura si has visto el pico; es una frontera de memoria.

Swift ARC es excelente, pero no es un recolector de basura y no reemplaza el ciclo de vida de Objective-C. `autoreleasepool` sigue siendo la herramienta para decir: «estos temporales ya no me hacen falta al final de esta iteración». Una línea puede ser la diferencia entre procesar mil fotos y que iOS termine la app.

La próxima vez que veas un pico en un bucle, no empieces por el pool: mide, comprueba si hay referencias fuertes y luego acota la iteración. Pero si el patrón encaja, no lo dudes: es una de las optimizaciones más pequeñas con mayor efecto.

## Referencias

- [ARC in Swift: Basics and beyond (WWDC21)](https://developer.apple.com/videos/play/wwdc2021/10216/)
- [Using Autorelease Pool Blocks](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/MemoryMgmt/Articles/mmAutoreleasePools.html)
- [NSAutoreleasePool](https://developer.apple.com/documentation/foundation/nsautoreleasepool)
- [autoreleasepool(invoking:)](https://developer.apple.com/documentation/objectivec/autoreleasepool%28invoking:%29)
- [The role of autoreleasepool in Swift (Swift Forums)](https://forums.swift.org/t/the-role-of-autoreleasepool-in-swift-and-thoughts-about-memory-management-in-swift/52976)
- [Is autoreleasepool still needed with the new Foundation? (Swift Forums)](https://forums.swift.org/t/is-autoreleasepool-still-needed-with-the-new-foundation/83224)
- [autoreleasepool uses in Swift](https://swiftrocks.com/autoreleasepool-in-swift)
- [Gathering information about memory use](https://developer.apple.com/documentation/xcode/gathering-information-about-memory-use)
- [XCTMemoryMetric](https://developer.apple.com/documentation/xctest/xctmemorymetric)

</div>

<div class="lang-en" lang="en" markdown="1">

Imagine a folder with thousands of photos. The code walks the files, loads each image, recompresses it, and saves it. Every iteration is independent. Memory should stay flat. Instead, it climbs and climbs until the app dies. There is no obvious retain cycle. There is no giant array. The culprit is one layer down: Objective-C's autorelease pool.

This is the pattern that usually shows up:

```swift
import UIKit

func reencodeImagesWithoutPool(from urls: [URL], to directory: URL) throws {
    for url in urls {
        guard let image = UIImage(contentsOfFile: url.path),
              let data = image.jpegData(compressionQuality: 0.8) else {
            continue
        }

        let filename = url.deletingPathExtension().lastPathComponent + ".jpg"
        try data.write(to: directory.appendingPathComponent(filename))
    }
}
```

The code looks correct. `image` and `data` are local references; when the iteration ends, they should not stay alive. But ARC is not the only memory system at work here.

## What ARC actually guarantees

In Swift, an object starts living at initialization, and its guaranteed lifetime ends at its last use. The compiler inserts `retain` and `release` operations; depending on optimization, the object may be released right after that last use or later. The guarantee is the minimum, not the exact instant. This is different from C++, where the closing brace marks the end of the object's lifetime.

Apple explains this in the [ARC in Swift: Basics and beyond](https://developer.apple.com/videos/play/wwdc2021/10216/) session from WWDC21. The idea that “Swift already releases everything exactly when it is no longer needed” is half true: ARC usually gets close to the last use, but it is not a garbage collector and it does not promise to release on the exact line you have in mind.

> **Nuance:** ARC guarantees that an object lives at least until its last use. It does not guarantee that it dies exactly there. And objects that Objective-C sends to `autorelease` do not follow Swift's ARC rules.
{: .doc-callout .doc-callout--note}

For pure Swift objects, `autoreleasepool` usually does nothing: there is no `autorelease` to drain. The problem appears when the loop calls Foundation or UIKit APIs that are still Objective-C underneath.

## The layer that is still Objective-C

When an object receives `autorelease`, it is not released right away. It is added to the current pool. When the pool drains, the object receives a `release` for every `autorelease` it received inside that block.

UIKit and AppKit create a pool at the beginning of every run loop iteration and drain it at the end. That is why, in a normal interface action, you do not have to worry: the system is already doing the work. The problem is that your loop can run entirely inside one run loop iteration. Everything autoreleased inside it accumulates until you finish the batch.

Apple's memory guide says it explicitly: if you write a loop that creates many temporary objects, you can use a pool inside the loop to reduce the peak memory footprint. It also recommends creating one when you start a secondary thread. This is not a manual-memory-management relic: Foundation and UIKit are still largely Objective-C, and some modern APIs bridge to Objective-C depending on the OS version or the arguments they receive.

> **Careful:** there is no reliable list of which APIs use `autorelease` internally. Even an apparently Swift API such as `Data(contentsOf:)` has behaved differently across versions. The rule is not to memorize names: it is to measure and bound the scope when you see the pattern.
{: .doc-callout .doc-callout--important}

On Darwin, Swift Concurrency wraps every job in a pool, and RunLoop does the same. GCD can configure the pool frequency per queue, including one pool per block. That does not save you if a long job contains a loop that creates thousands of temporaries: the job's pool does not drain until the job finishes.

## The fix: one pool per iteration

The version with `autoreleasepool` changes very little:

```swift
import UIKit

func reencodeImages(from urls: [URL], to directory: URL) throws {
    for url in urls {
        try autoreleasepool {
            guard let image = UIImage(contentsOfFile: url.path),
                  let data = image.jpegData(compressionQuality: 0.8) else {
                return
            }

            let filename = url.deletingPathExtension().lastPathComponent + ".jpg"
            try data.write(to: directory.appendingPathComponent(filename))
        }
    }
}
```

The body of the iteration lives inside the pool. When the block ends, the autoreleased objects from that iteration receive their `release`. The `return` exits the closure, not the function; the next iteration continues. If the body throws, `try` propagates the error; you do not need a `do/catch` just for the pool.

`autoreleasepool` is not a keyword: it is a function from the `ObjectiveC` module that Foundation and UIKit re-export. In an app with UIKit it is already available; in a standalone file you need `import Foundation`, `import UIKit`, or `import ObjectiveC`.

The pool goes **inside** the loop, not around it. This pseudocode does not help:

```swift
autoreleasepool {
    for url in urls {
        // ...
    }
}
```

There, the pool drains at the end of the batch, exactly when it no longer matters. The unit you want to bound is the iteration, not the whole operation.

If you need a result, return only something small:

```swift
import UIKit

func imageSizes(at urls: [URL]) -> [CGSize] {
    urls.compactMap { url in
        autoreleasepool {
            UIImage(contentsOfFile: url.path)?.size
        }
    }
}
```

If you return the image or the large `Data`, the pool cannot perform magic: the value stays alive in the outer scope. `autoreleasepool` releases temporaries, not strong references that you keep.

## What autoreleasepool does not fix

- **An array that accumulates every image.** The array is a strong reference; the peak is yours. The pool does not reduce memory for something you keep holding.
- **A retain cycle.** The object never goes away; the pool does not break cycles.
- **A cache.** `UIImage(named:)`, `NSCache`, and friends retain objects on purpose.
- **A pool around the whole loop.** It drains too late.
- **Pure Swift code.** If there is no `autorelease`, there is nothing to drain.
- **A real ImageIO or UIKit leak.** If the peak continues after the pool, you need the memory graph and Instruments.

The quick table:

| Situation | What to do |
| --- | --- |
| A loop with `UIImage`, `NSImage`, `NSAttributedString`, or similar | `autoreleasepool` per iteration |
| A pure Swift model or struct | Nothing; ARC handles it |
| An array that retains every result | Redesign; the pool does not reduce the peak |
| A long custom thread | Pool at the start and/or per iteration |
| A retain cycle or a cache | Memory graph; the pool does not fix it |
| A peak measured in Instruments | Try the pool and measure again |

## How to verify it

Start with Xcode's memory report: it shows the shape of the peak and whether it grows with the batch. To find out who is causing it, open Instruments and use the Allocations instrument. Mark generations before and after one iteration or one batch, and compare with and without the pool. What you are looking for is not only memory retained at the end, but the transient peak that can make iOS terminate the app.

If you want an automated check, `XCTMemoryMetric` measures memory use during a block. It is useful for catching retained-memory regressions, but for transient peaks the Allocations instrument is more direct. Do not set a threshold based on a single run: memory varies across devices and OS versions.

And do not optimize blindly. `autoreleasepool` has a small push/pop cost; use it where there are many Objective-C temporaries, not in every function just in case.

## The practical rule

If a loop creates and discards Objective-C objects, give each iteration its own pool. It is not premature optimization if you have seen the peak; it is a memory boundary.

Swift ARC is excellent, but it is not a garbage collector and it does not replace Objective-C's object lifetime. `autoreleasepool` is still the tool for saying: “I no longer need these temporaries at the end of this iteration.” One line can be the difference between processing a thousand photos and having iOS terminate the app.

The next time you see a peak in a loop, do not start with the pool: measure, check for strong references, and then bound the iteration. But if the pattern fits, do not hesitate: it is one of the smallest optimizations with the biggest effect.

## References

- [ARC in Swift: Basics and beyond (WWDC21)](https://developer.apple.com/videos/play/wwdc2021/10216/)
- [Using Autorelease Pool Blocks](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/MemoryMgmt/Articles/mmAutoreleasePools.html)
- [NSAutoreleasePool](https://developer.apple.com/documentation/foundation/nsautoreleasepool)
- [autoreleasepool(invoking:)](https://developer.apple.com/documentation/objectivec/autoreleasepool%28invoking:%29)
- [The role of autoreleasepool in Swift (Swift Forums)](https://forums.swift.org/t/the-role-of-autoreleasepool-in-swift-and-thoughts-about-memory-management-in-swift/52976)
- [Is autoreleasepool still needed with the new Foundation? (Swift Forums)](https://forums.swift.org/t/is-autoreleasepool-still-needed-with-the-new-foundation/83224)
- [autoreleasepool uses in Swift](https://swiftrocks.com/autoreleasepool-in-swift)
- [Gathering information about memory use](https://developer.apple.com/documentation/xcode/gathering-information-about-memory-use)
- [XCTMemoryMetric](https://developer.apple.com/documentation/xctest/xctmemorymetric)

</div>
