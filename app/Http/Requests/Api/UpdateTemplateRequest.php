<?php

namespace App\Http\Requests\Api;

use Illuminate\Foundation\Http\FormRequest;

class UpdateTemplateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        // Support minimal { version, canvas:{width,height}, background_url?:string|null, frames:[] } during updates as well.
        // Laravel validation docs: https://laravel.com/docs/12.x/validation
        $hasMinimal = $this->has(['canvas.width', 'canvas.height']) && $this->has('frames');
        if ($hasMinimal) {
            $width = (int) $this->input('canvas.width');
            $height = (int) $this->input('canvas.height');
            $frames = $this->input('frames', []);
            $version = (int) $this->input('version', 1);
            $bg = $this->input('background_url');
            $backgroundUrl = is_string($bg) && $bg !== '' ? $bg : null;

            $this->merge([
                'canvas_width' => $width,
                'canvas_height' => $height,
                'elements' => [
                    'version' => $version,
                    'canvas' => [ 'width' => $width, 'height' => $height ],
                    'background_url' => $backgroundUrl,
                    'frames' => is_array($frames) ? $frames : [],
                ],
            ]);
        }
    }

    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'string', 'max:120'],
            'canvas_width' => ['sometimes', 'integer', 'min:1', 'max:8192'],
            'canvas_height' => ['sometimes', 'integer', 'min:1', 'max:8192'],

            // Elements shape for partial update
            'elements' => ['sometimes', 'array'],
            'elements.version' => ['sometimes', 'integer'],
            'elements.canvas' => ['sometimes', 'array'],
            'elements.canvas.width' => ['sometimes', 'integer', 'min:1', 'max:10000'],
            'elements.canvas.height' => ['sometimes', 'integer', 'min:1', 'max:10000'],
            'elements.background_url' => ['nullable', 'string', 'max:2048'],
            'elements.frames' => ['sometimes', 'array'],
            'elements.frames.*.id' => ['required_with:elements.frames', 'string', 'max:64'],
            'elements.frames.*.x' => ['required_with:elements.frames', 'numeric'],
            'elements.frames.*.y' => ['required_with:elements.frames', 'numeric'],
            'elements.frames.*.w' => ['required_with:elements.frames', 'numeric', 'min:1'],
            'elements.frames.*.h' => ['required_with:elements.frames', 'numeric', 'min:1'],
            'elements.frames.*.fit' => ['required_with:elements.frames', 'in:cover,contain'],
            'elements.frames.*.name' => ['nullable', 'string', 'max:100'],
        ];
    }
}
