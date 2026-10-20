<?php

namespace App\Support;

/** Letter grades + remarks from a percentage, on a single shared scale. */
class Grading
{
    /** [min %, letter, Arabic remark, color token]. */
    public const SCALE = [
        [90, 'A', 'ممتاز', '#14a06b'],
        [80, 'B', 'جيد جداً', '#2f7ae5'],
        [65, 'C', 'جيد', '#0f9d9a'],
        [50, 'D', 'مقبول', '#d98a0b'],
        [0, 'F', 'راسب', '#e0384c'],
    ];

    /** @return array{letter:string,remark:string,color:string,pass:bool} */
    public static function grade(?float $percent): array
    {
        if ($percent === null) {
            return ['letter' => '—', 'remark' => 'غير مرصود', 'color' => '#8a93a6', 'pass' => false];
        }
        foreach (self::SCALE as [$min, $letter, $remark, $color]) {
            if ($percent >= $min) {
                return ['letter' => $letter, 'remark' => $remark, 'color' => $color, 'pass' => $percent >= 50];
            }
        }

        return ['letter' => 'F', 'remark' => 'راسب', 'color' => '#e0384c', 'pass' => false];
    }

    public static function round(?float $v): ?float
    {
        return $v === null ? null : round($v, 2);
    }
}
