---
title: "AttributedString: formato, enlaces y VoiceOver en SwiftUI"
title_en: "AttributedString: formatting, links, and VoiceOver in SwiftUI"
date: 2026-11-16 09:00:00
description: "Cómo dar formato a un texto con AttributedString, gestionar enlaces con OpenURLAction y hacer que VoiceOver los reconozca como enlaces."
description_en: "How to format text with AttributedString, handle links with OpenURLAction, and make VoiceOver recognize them as links."
lang: es
tags: [iOS, SwiftUI, AttributedString, Accessibility, VoiceOver]
categories: blog
layout: blog
reading_time: 7
---

<div class="lang-es" lang="es" markdown="1">

Un párrafo con una negrita, una cursiva, un fragmento de código y dos enlaces parece un problema resuelto. Hasta que toca que VoiceOver lo lea como lo que es: texto con énfasis y enlaces, no una sola frase plana.

El problema no es solo pintar el texto. Un enlace tiene que seguir siéndolo cuando VoiceOver lo recorre, cuando cambia el tamaño de la letra o cuando el párrafo se combina con otros elementos. Si el formato vive solo en el color y el subrayado, la semántica se pierde.

`AttributedString` no elimina toda la complejidad, pero junta las piezas en un solo valor. Y, sobre todo, permite que el formato tenga significado además de apariencia.

## Dos capas: cómo se ve y qué es

El error clásico es tratar un enlace como texto azul con subrayado. Para los ojos, eso es un enlace. Para VoiceOver, no. Lo que convierte un fragmento en un enlace es el atributo `.link`, no el color.

Lo mismo pasa con la negrita y la cursiva. Puedes pintar una palabra con una fuente concreta o puedes marcar que esa palabra está enfatizada. La primera opción cambia la apariencia; la segunda también puede cambiar cómo se interpreta el texto.

```swift
import SwiftUI

struct ArticleText: View {
    private var content: AttributedString {
        var text = AttributedString("AttributedString permite mezclar formato, enlaces y semántica en un solo valor.")

        if let range = text.range(of: "formato") {
            text[range].inlinePresentationIntent = .stronglyEmphasized
        }

        if let range = text.range(of: "enlaces") {
            text[range].link = URL(string: "https://developer.apple.com/documentation/foundation/attributedstring")
            text[range].underlineStyle = .single
            text[range].foregroundColor = .accentColor
        }

        return text
    }

    var body: some View {
        Text(content)
            .font(.body)
            .tint(.accentColor)
    }
}
```

`inlinePresentationIntent` expresa la intención —énfasis fuerte, énfasis, código— y SwiftUI decide cómo representarla. Si necesitas una fuente concreta, puedes usar `.font`, pero para texto de lectura conviene partir de estilos semánticos como `.body` o `.headline` para que Dynamic Type siga funcionando.

El atributo que no es negociable es `.link`. El subrayado y el color ayudan a verlo, pero no lo convierten en un enlace. Si quitas `.link` y dejas solo el color azul, tendrás texto bonito y ningún enlace.

<figure class="post-figure">
  <img src="https://i.ibb.co/dsSScfYg/attributedstring-es-device.png" alt="Captura de la app de ejemplo con el título AttributedString, texto formateado y un enlace subrayado.">
  <figcaption>Una vista de ejemplo con formato semántico y un enlace real, en un iPhone 15 Pro.</figcaption>
</figure>

## Markdown como punto de partida

Si el texto ya viene en Markdown, no hace falta recorrer rangos a mano:

```swift
import Foundation

func makeMarkdown() throws -> AttributedString {
    let markdown = "**Importante:** lee la [guía de AttributedString](https://developer.apple.com/documentation/foundation/attributedstring)."
    let options = AttributedString.MarkdownParsingOptions(
        interpretedSyntax: .inlineOnlyPreservingWhitespace
    )
    return try AttributedString(markdown: markdown, options: options)
}
```

`inlineOnlyPreservingWhitespace` interpreta el Markdown como texto en línea y conserva los saltos de línea. Es útil para párrafos que vienen de una API, una nota o un campo de texto, donde no quieres que un `#` se convierta en un título de pantalla.

`Text` también acepta Markdown directamente en un string. La diferencia es que `AttributedString` te deja el valor en la mano: puedes añadir atributos, cambiar un enlace, combinar varios fragmentos o pasarlo a otra capa antes de renderizarlo.

## Enlaces que se comportan como enlaces

En SwiftUI, un `Text` con un `AttributedString` que contiene `.link` ya es interactivo. No necesitas un gesto sobre el texto ni calcular qué palabra se ha pulsado.

Si quieres decidir qué ocurre con algunos enlaces, usa `OpenURLAction`:

```swift
import SwiftUI

struct LinkHandlingView: View {
    let text: AttributedString

    var body: some View {
        Text(text)
            .environment(\.openURL, OpenURLAction { url in
                guard url.scheme == "myapp" else {
                    return .systemAction
                }

                // Abre una pantalla interna o registra el evento.
                return .handled
            })
    }
}
```

- `.systemAction` deja que el sistema abra el enlace: Safari, Mail, la app que corresponda.
- `.handled` indica que ya lo has gestionado.
- `.discarded` lo ignora.

Para acciones internas, un esquema propio como `myapp://glossary/attributedstring` es suficiente. Para contenido web normal, deja que el sistema haga su trabajo. No conviertas todos los enlaces en acciones internas solo porque puedes.

## VoiceOver: el enlace tiene que existir en el árbol

Cuando `Text` encuentra un fragmento con `.link`, lo expone como un enlace. VoiceOver lo anuncia como tal y lo añade al rotor de enlaces. No hace falta añadir `.accessibilityAddTraits(.isLink)` al párrafo entero; de hecho, puede ser contraproducente.

Hay tres formas bastante habituales de romperlo:

1. Pintar el texto de azul y subrayarlo sin `.link`.
2. Usar `.onTapGesture` sobre el `Text` para abrir una pantalla.
3. Aplicar `.accessibilityElement(children: .combine)` o un `.accessibilityLabel` al párrafo completo.

Las tres convierten el párrafo en una sola parada. Visualmente sigue pareciendo un enlace; para VoiceOver, ya no lo es.

El texto del enlace también importa. «Aquí» o «más información» no dicen nada fuera de contexto. «Guía de AttributedString» sí. VoiceOver permite recorrer los enlaces con el rotor; si todos se llaman «aquí», el rotor es inútil.

Si tienes un encabezado visual, añade también la semántica:

```swift
import SwiftUI

Text("Enlaces")
    .font(.headline)
    .accessibilityAddTraits(.isHeader)
```

Prueba con el rotor de enlaces, no solo leyendo el párrafo de arriba abajo. En el simulador, activa VoiceOver o usa Accessibility Inspector. Comprueba que cada enlace aparece en el rotor, que el foco no se queda atrapado y que el orden coincide con el texto.

## La decisión práctica

| Necesito | Uso |
| --- | --- |
| Varios enlaces dentro de un párrafo en SwiftUI | `AttributedString` + `Text` |
| Decidir qué hace un enlace | `OpenURLAction` |
| Un enlace suelto y aislado | `Link` |
| Que VoiceOver lo reconozca | atributo `.link`, no color ni subrayado |

El formato no es decoración. Un enlace es una promesa de navegación; si solo lo parece, la promesa se rompe para quien no lo ve. `AttributedString` no es solo una API más cómoda: es una forma de que el texto lleve su significado consigo.

## Referencias

- [AttributedString](https://developer.apple.com/documentation/foundation/attributedstring)
- [AttributedString.MarkdownParsingOptions](https://developer.apple.com/documentation/foundation/attributedstring/markdownparsingoptions)
- [Text](https://developer.apple.com/documentation/swiftui/text)
- [OpenURLAction](https://developer.apple.com/documentation/swiftui/openurlaction)
- [openURL](https://developer.apple.com/documentation/swiftui/environmentvalues/openurl)
- [VoiceOver](https://developer.apple.com/documentation/accessibility/voiceover)
- [Accessibility Inspector](https://developer.apple.com/documentation/accessibility/accessibility-inspector)

</div>

<div class="lang-en" lang="en" markdown="1">

A paragraph with bold, italic, a code fragment, and two links sounds like a solved problem. Then VoiceOver has to read it as what it is: text with emphasis and links, not one flat sentence.

The problem is not just painting the text. A link has to remain a link when VoiceOver moves through it, when the text size changes, or when the paragraph is combined with other elements. If formatting lives only in color and underline, the semantics get lost.

`AttributedString` does not remove every sharp edge, but it brings the pieces into one value. More importantly, it lets formatting carry meaning, not just appearance.

## Two layers: how it looks and what it is

The classic mistake is treating a link as blue, underlined text. To your eyes, that is a link. To VoiceOver, it is not. What turns a run into a link is the `.link` attribute, not the color.

The same applies to bold and italic. You can paint a word with a specific font, or you can mark that the word is emphasized. The first changes appearance; the second can also change how the text is interpreted.

```swift
import SwiftUI

struct ArticleText: View {
    private var content: AttributedString {
        var text = AttributedString("AttributedString can mix formatting, links, and semantics in a single value.")

        if let range = text.range(of: "formatting") {
            text[range].inlinePresentationIntent = .stronglyEmphasized
        }

        if let range = text.range(of: "links") {
            text[range].link = URL(string: "https://developer.apple.com/documentation/foundation/attributedstring")
            text[range].underlineStyle = .single
            text[range].foregroundColor = .accentColor
        }

        return text
    }

    var body: some View {
        Text(content)
            .font(.body)
            .tint(.accentColor)
    }
}
```

`inlinePresentationIntent` expresses intent — strong emphasis, emphasis, code — and SwiftUI decides how to render it. If you need a specific font, you can use `.font`, but for reading text it is better to start from semantic styles such as `.body` or `.headline` so Dynamic Type keeps working.

The non-negotiable attribute is `.link`. Underline and color help people see it, but they do not make it a link. Remove `.link` and keep the blue color, and you have pretty text with no link at all.

<figure class="post-figure">
  <img src="https://i.ibb.co/f5tBSFK/attributedstring-en-device.png" alt="Screenshot of the sample app with the AttributedString title, formatted text, and an underlined link.">
  <figcaption>An example view with semantic formatting and a real link, on an iPhone 15 Pro.</figcaption>
</figure>

## Markdown as a starting point

If the text already arrives as Markdown, you do not need to walk ranges by hand:

```swift
import Foundation

func makeMarkdown() throws -> AttributedString {
    let markdown = "**Important:** read the [AttributedString guide](https://developer.apple.com/documentation/foundation/attributedstring)."
    let options = AttributedString.MarkdownParsingOptions(
        interpretedSyntax: .inlineOnlyPreservingWhitespace
    )
    return try AttributedString(markdown: markdown, options: options)
}
```

`inlineOnlyPreservingWhitespace` parses Markdown as inline text and preserves line breaks. It is useful for paragraphs that come from an API, a note, or a text field, where you do not want a `#` to become a screen title.

`Text` also accepts Markdown directly in a string. The difference is that `AttributedString` leaves the value in your hands: you can add attributes, replace a link, combine fragments, or pass it to another layer before rendering it.

## Links that behave like links

In SwiftUI, a `Text` backed by an `AttributedString` with `.link` is already interactive. You do not need a gesture on the text or code that works out which word was tapped.

If you want to decide what happens to some links, use `OpenURLAction`:

```swift
import SwiftUI

struct LinkHandlingView: View {
    let text: AttributedString

    var body: some View {
        Text(text)
            .environment(\.openURL, OpenURLAction { url in
                guard url.scheme == "myapp" else {
                    return .systemAction
                }

                // Open an internal screen or record the event.
                return .handled
            })
    }
}
```

- `.systemAction` lets the system open the link: Safari, Mail, or the matching app.
- `.handled` means you have already handled it.
- `.discarded` ignores it.

For internal actions, a custom scheme such as `myapp://glossary/attributedstring` is enough. For ordinary web content, let the system do its job. Do not turn every link into an internal action just because you can.

## VoiceOver: the link has to exist in the tree

When `Text` finds a run with `.link`, it exposes it as a link. VoiceOver announces it as a link and adds it to the links rotor. You do not need to add `.accessibilityAddTraits(.isLink)` to the whole paragraph; in fact, it can backfire.

There are three common ways to break it:

1. Paint the text blue and underline it without `.link`.
2. Use `.onTapGesture` on the `Text` to open a screen.
3. Apply `.accessibilityElement(children: .combine)` or an `.accessibilityLabel` to the entire paragraph.

All three collapse the paragraph into a single stop. It still looks like a link; to VoiceOver, it is no longer one.

Link text matters too. “Here” or “more information” says nothing out of context. “AttributedString guide” does. VoiceOver lets people move through links with the rotor; if every link is called “here”, the rotor is useless.

If you have a visual heading, add the semantics too:

```swift
import SwiftUI

Text("Links")
    .font(.headline)
    .accessibilityAddTraits(.isHeader)
```

Test with the links rotor, not just by reading the paragraph from top to bottom. In the simulator, turn on VoiceOver or use Accessibility Inspector. Check that each link appears in the rotor, that focus does not get trapped, and that the order matches the text.

## The practical decision

| I need | I use |
| --- | --- |
| Several links inside a SwiftUI paragraph | `AttributedString` + `Text` |
| Decide what a link does | `OpenURLAction` |
| A single, isolated link | `Link` |
| VoiceOver to recognize it | the `.link` attribute, not color or underline |

Formatting is not decoration. A link is a navigation promise; if it only looks like one, the promise breaks for people who cannot see it. `AttributedString` is not just a more convenient API: it is a way for text to carry its meaning with it.

## References

- [AttributedString](https://developer.apple.com/documentation/foundation/attributedstring)
- [AttributedString.MarkdownParsingOptions](https://developer.apple.com/documentation/foundation/attributedstring/markdownparsingoptions)
- [Text](https://developer.apple.com/documentation/swiftui/text)
- [OpenURLAction](https://developer.apple.com/documentation/swiftui/openurlaction)
- [openURL](https://developer.apple.com/documentation/swiftui/environmentvalues/openurl)
- [VoiceOver](https://developer.apple.com/documentation/accessibility/voiceover)
- [Accessibility Inspector](https://developer.apple.com/documentation/accessibility/accessibility-inspector)

</div>
