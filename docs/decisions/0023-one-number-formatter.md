# 0023 — One number formatter, shared by the figure and the text

## Status

Accepted.

## The defect

The Cálculo 1 sheet printed "(2, 5)" beside the decimal "0,5". In Portuguese the comma *is* the decimal mark, so "(2, 5)" also reads as the single number two-and-a-half in brackets. Brazilian school mathematics settles it with a semicolon between coordinates — "(2; 5)", "(2,5; 7,25)" — and the sheet's own lead paragraph said so. The figures followed the rule only where the author remembered to, label by label, and the text around them was typed separately again.

## The decision

**`src/locale/format.ts` is the only place a number becomes text.** The figure (function-graph tick numbers and computed labels) and the sheet (placeholders in statements, captions and answers) both call it, so a label and the sentence citing it cannot disagree about how a number is written — neither of them writes it.

It decides three things and nothing else:

- **Marks.** pt-BR: decimal comma, `; ` between coordinates, `.` for thousands (off by default — an axis number is not an amount). `en` is kept as the second locale so the choice is visibly a parameter, not a hard-coded habit.
- **The minus is U+2212 "−"**, never the hyphen a keyboard produces, which sets short and high beside a digit.
- **The shortest honest form.** An integer; a decimal of at most three places; a small-denominator fraction; and only as a last resort a decimal rounded to three places. 17/3 prints as "17/3": "5,667" is a different number, and a figure labelled with it contradicts the exact answer the student is asked to find. `decimals` fixes the places for money ("2073,60").

Float noise is absorbed by a relative tolerance of 1e-7, so a slope from a symmetric difference prints "12", not "12,000000001", and 0.1 + 0.2 prints "0,3".

**Two spellings of one value.** `formatNumberTex` / `formatPointTex` write the same number as TeX for KaTeX: `2{,}5` (a bare comma in TeX math is punctuation and gets a thin space — the very ambiguity being removed) and `\left(2;\,5\right)`. The sheet chooses the spelling by whether the placeholder sits inside `\( \)` / `$$ $$`.

`parseNumber` reads the figure's own spelling back, which is what lets `axis-number-present` recognise "−1" and "0,5" as the numbers an axis promised.

## What was refused

**`Intl.NumberFormat`.** It groups thousands by default, has no notion of the coordinate separator, writes a hyphen-minus, and has no fraction form. Every one of the four would have been a wrapper undoing its output.

**Formatting in each caller.** That is exactly the state the sheet was in.

## The cost, stated

The fraction search stops at denominator 24. A value like 1/29 prints as a rounded decimal. For a teaching figure that is a fair limit; it is stated here so nobody discovers it as a bug.
