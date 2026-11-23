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

Imagina que tienes una carpeta con miles de fotos. Tu código recorre los archivos, carga cada imagen, la comprime de nuevo y guarda el resultado. Cada iteración es independiente, así que esperarías que el consumo de memoria se mantuviera más o menos estable.

Pero ocurre justo lo contrario: la memoria no deja de crecer hasta que iOS termina cerrando la app.

No hay ningún retain cycle evidente (un ciclo de referencias fuertes) ni un array acumulando todas las imágenes. El problema está un poco más abajo: en el autorelease pool de Objective-C.

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

A primera vista, el código parece correcto. `image` y `data` son referencias locales; cuando termina la iteración, no deberían quedar vivas. Pero ARC no es el único sistema de memoria que está trabajando aquí.

## Lo que ARC sí garantiza

En Swift, un objeto empieza a vivir en su inicialización y su vida garantizada termina en su último uso. El compilador inserta operaciones `retain` y `release`; según las optimizaciones, el objeto puede liberarse justo después de ese último uso o más tarde. Lo que garantiza es que el objeto seguirá vivo hasta ese momento, no que se libere exactamente entonces. Es distinto de C++, donde el cierre del bloque marca el final de la vida del objeto.

Apple lo explica en la sesión [ARC in Swift: Basics and beyond](https://developer.apple.com/videos/play/wwdc2021/10216/) de la WWDC21. Decir que «Swift libera los objetos justo cuando dejan de hacer falta» es quedarse a medias. ARC suele liberar los objetos cerca de su último uso, pero no es un recolector de basura ni garantiza que se liberen exactamente en ese momento.

> **Matiz:** ARC garantiza que un objeto vive al menos hasta su último uso. No garantiza que muera exactamente ahí. Y los objetos que Objective-C envía a `autorelease` no siguen las reglas de ARC de Swift.
{: .doc-callout .doc-callout--note}

Para objetos puramente Swift, `autoreleasepool` normalmente no hace nada: no hay ningún `autorelease` que drenar. El problema aparece cuando el bucle llama a APIs de Foundation o UIKit que, por debajo, siguen siendo Objective-C.

## La parte de Objective-C que sigue interviniendo

Cuando un objeto recibe `autorelease`, su liberación se pospone. En lugar de liberarse inmediatamente, queda registrado en el pool actual. Cuando el pool se drena, recibe un `release` por cada `autorelease` que recibió dentro de ese bloque.

UIKit y AppKit crean un pool al principio de cada iteración del run loop y lo drenan al final. Por eso, en una acción normal de la interfaz, no tienes que preocuparte: el sistema ya está haciendo el trabajo. El problema aparece cuando el bucle entero se ejecuta dentro de una misma iteración del run loop. Todos esos objetos se acumulan en el pool hasta que termina el lote y se drena.

La guía de memoria de Apple lo dice de forma explícita: si escribes un bucle que crea muchos objetos temporales, puedes usar un pool dentro del bucle para reducir el pico de memoria. También recomienda crear uno al empezar un hilo secundario. No es una reliquia de la época manual: Foundation y UIKit siguen siendo Objective-C en gran parte, y algunas APIs modernas puentean a Objective-C según la versión del sistema o los argumentos que reciben.

> **Ojo:** no hay una lista fiable de qué APIs usan `autorelease` por dentro. Hasta una API aparentemente Swift como `Data(contentsOf:)` se ha comportado distinto entre versiones. La regla no es memorizar nombres: es medir y acotar cuando veas el patrón.
{: .doc-callout .doc-callout--important}

## La solución: un pool por iteración

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

Todo el trabajo de esa iteración queda dentro del pool. Al terminar el bloque, los objetos autoreleased de esa iteración reciben su `release`. Si no se puede cargar una imagen o generar sus datos, el `return` termina únicamente el closure de `autoreleasepool`; el bucle continúa con la siguiente URL. Si el cuerpo lanza un error, `try` lo propaga; no necesitas un `do/catch` solo para el pool.

`autoreleasepool` no es una palabra clave: es una función del módulo `ObjectiveC` que Foundation y UIKit reexportan.

El pool va **dentro** del bucle, no alrededor. Este pseudocódigo no sirve:

```swift
autoreleasepool {
    for url in urls {
        // ...
    }
}
```

Ahí el pool se vacía al final del lote, justo cuando ya no importa. La unidad que quieres acotar es la iteración, no la operación completa.

Si necesitas devolver un resultado, procura que sea algo pequeño:

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
- **Un pool alrededor de todo el bucle.** Se vacía demasiado tarde.
- **Código Swift puro.** Si no hay `autorelease`, no hay nada que drenar.
- **Un leak real de ImageIO o UIKit.** Si el pico sigue después del pool, necesitas el memory graph y Instruments.

## Resumen: cuándo utilizar autoreleasepool

| Situación | Qué hacer |
| --- | --- |
| Bucle con `UIImage`, `NSImage`, `NSAttributedString` o similar | `autoreleasepool` por iteración |
| Modelo o struct Swift puro | Nada; ARC se encarga |
| Array que retiene todos los resultados | Rediseña; el pool no reduce el pico |
| Hilo propio largo | Pool al inicio y/o por iteración |
| Retain cycle o caché | Memory graph; el pool no lo arregla |
| Pico medido en Instruments | Prueba el pool y vuelve a medir |

## Cómo comprobarlo

Empieza por el informe de memoria de Xcode: te da la forma del pico y te dice si crece con el lote. Para saber quién lo causa, abre Instruments y usa el instrumento Allocations. Marca generaciones antes y después de una iteración o de un lote, y compara con y sin pool. Lo que buscas no es solo la memoria retenida al final, sino el pico transitorio que puede hacer que iOS termine la app.

Si quieres una prueba automática, `XCTMemoryMetric` mide el uso de memoria durante un bloque. Es útil para detectar regresiones de memoria retenida, pero para picos transitorios el instrumento Allocations es más directo. No pongas un umbral basado en una sola ejecución: la memoria varía entre dispositivos y versiones.

Y no optimices a ciegas. Crear y vaciar un `autoreleasepool` tiene un pequeño coste. Por eso, úsalo cuando tengas muchos objetos temporales de Objective-C, no indiscriminadamente en cualquier función.

## Quédate con esta idea

Swift ARC hace un gran trabajo gestionando la memoria, pero no sustituye al mecanismo de gestión de memoria de Objective-C.

Cuando un bucle crea muchos objetos temporales procedentes de APIs de Objective-C, `autoreleasepool` te permite limitar cuánto tiempo permanecen acumulados en memoria.

La próxima vez que veas crecer el consumo de memoria durante un procesamiento por lotes, no añadas un pool a ciegas. Primero mide, comprueba qué objetos siguen vivos y busca posibles referencias fuertes. Si el problema está en los objetos autoreleased, un pool por iteración puede marcar la diferencia entre procesar miles de imágenes sin problemas y quedarte sin memoria.

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

Imagine a folder with thousands of photos. Your code walks the files, loads each image, compresses it again, and saves the result. Each iteration is independent, so you would expect memory use to stay roughly flat.

But the opposite happens: memory keeps growing until iOS closes the app.

There is no obvious retain cycle (a cycle of strong references) and no array accumulating every image. The problem is one layer down: Objective-C's autorelease pool.

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

At first glance, the code looks correct. `image` and `data` are local references; when the iteration ends, they should not stay alive. But ARC is not the only memory system at work here.

## What ARC actually guarantees

In Swift, an object starts living at initialization, and its guaranteed lifetime ends at its last use. The compiler inserts `retain` and `release` operations; depending on optimization, the object may be released right after that last use or later. What it guarantees is that the object stays alive until that point, not that it is released exactly then. This is different from C++, where the closing brace marks the end of the object's lifetime.

Apple explains this in the [ARC in Swift: Basics and beyond](https://developer.apple.com/videos/play/wwdc2021/10216/) session from WWDC21. Saying that “Swift releases objects exactly when they stop being needed” is only half the story. ARC usually releases objects close to their last use, but it is not a garbage collector and it does not guarantee release at that exact moment.

> **Nuance:** ARC guarantees that an object lives at least until its last use. It does not guarantee that it dies exactly there. And objects that Objective-C sends to `autorelease` do not follow Swift's ARC rules.
{: .doc-callout .doc-callout--note}

For pure Swift objects, `autoreleasepool` usually does nothing: there is no `autorelease` to drain. The problem appears when the loop calls Foundation or UIKit APIs that are still Objective-C underneath.

## The Objective-C layer that is still involved

When an object receives `autorelease`, its release is postponed. Instead of being released immediately, it is recorded in the current pool. When the pool drains, the object receives a `release` for every `autorelease` it received inside that block.

UIKit and AppKit create a pool at the beginning of every run loop iteration and drain it at the end. That is why, in a normal interface action, you do not have to worry: the system is already doing the work. The problem appears when the entire loop runs inside a single run loop iteration. All those objects accumulate in the pool until the batch ends and the pool drains.

Apple's memory guide says it explicitly: if you write a loop that creates many temporary objects, you can use a pool inside the loop to reduce the peak memory footprint. It also recommends creating one when you start a secondary thread. This is not a manual-memory-management relic: Foundation and UIKit are still largely Objective-C, and some modern APIs bridge to Objective-C depending on the OS version or the arguments they receive.

> **Careful:** there is no reliable list of which APIs use `autorelease` internally. Even an apparently Swift API such as `Data(contentsOf:)` has behaved differently across versions. The rule is not to memorize names: it is to measure and bound the scope when you see the pattern.
{: .doc-callout .doc-callout--important}

On Darwin, Swift Concurrency wraps every job (each unit of work) in a pool, and RunLoop does the same; GCD lets you configure the pool frequency per queue, including one pool per block. [David Smith summarizes it on Swift Forums](https://forums.swift.org/t/is-autoreleasepool-still-needed-with-the-new-foundation/83224). That does not save you if a long job contains a loop that creates thousands of temporaries: the pool associated with that job does not drain until the job finishes.

## The solution: one pool per iteration

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

All the work for that iteration stays inside the pool. When the block ends, the autoreleased objects from that iteration receive their `release`. If an image cannot be loaded or its data cannot be generated, `return` exits only the `autoreleasepool` closure; the loop continues with the next URL. If the body throws, `try` propagates the error; you do not need a `do/catch` just for the pool.

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

If you need to return a result, keep it small:

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

## Summary: when to use autoreleasepool

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

And do not optimize blindly. Creating and draining an `autoreleasepool` has a small cost. Use it when you have many Objective-C temporary objects, not indiscriminately in every function.

## The key takeaway

Swift ARC does a great job managing memory, but it does not replace Objective-C's memory-management mechanism.

When a loop creates many temporary objects from Objective-C APIs, `autoreleasepool` lets you limit how long they stay accumulated in memory.

The next time you see memory use grow during batch processing, do not add a pool blindly. First measure, check which objects are still alive, and look for possible strong references. If the problem is in autoreleased objects, a per-iteration pool can be the difference between processing thousands of images successfully and running out of memory.

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
