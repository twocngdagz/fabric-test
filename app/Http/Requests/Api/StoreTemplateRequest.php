<?php

namespace App\Http\Requests\Api;

use Illuminate\Foundation\Http\FormRequest;

class StoreTemplateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        // Accept minimal template JSON { version, canvas:{width,height}, background_url?:string|null, frames:[...] }
        // and normalize into canonical fields used by the Template model.
        // Laravel validation docs: https://laravel.com/docs/12.x/validation
        $hasMinimal = $this->has(['canvas.width', 'canvas.height']) && $this->has('frames');
        if ($hasMinimal) {
            $width = (int) $this->input('canvas.width');
            $height = (int) $this->input('canvas.height');
            $frames = $this->input('frames');
            $version = (int) $this->input('version', 1);
            $bg = $this->input('background_url');
            $backgroundUrl = is_string($bg) && $bg !== '' ? $bg : null;

            $name = $this->string('name')->toString();
            if ($name === '') {
                $name = 'Template '.now()->format('Y-m-d H:i:s');
            }

            $this->merge([
                'name' => $name,
                'canvas_width' => $width,
                'canvas_height' => $height,
                // Persist structured elements payload including optional background URL
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
            'name' => ['required', 'string', 'max:120'],
            'canvas_width' => ['required', 'integer', 'min:1', 'max:8192'],
            'canvas_height' => ['required', 'integer', 'min:1', 'max:8192'],

            // Elements shape (background_url is optional and stored inside elements JSON)
            'elements' => ['required', 'array'],
            'elements.version' => ['required', 'integer'],
            'elements.canvas' => ['required', 'array'],
            'elements.canvas.width' => ['required', 'integer', 'min:1', 'max:10000'],
            'elements.canvas.height' => ['required', 'integer', 'min:1', 'max:10000'],
            'elements.background_url' => ['nullable', 'string', 'max:2048'],
            'elements.frames' => ['required', 'array'],
            'elements.frames.*.id' => ['required', 'string', 'max:64'],
            'elements.frames.*.x' => ['required', 'numeric'],
            'elements.frames.*.y' => ['required', 'numeric'],
            'elements.frames.*.w' => ['required', 'numeric', 'min:1'],
            'elements.frames.*.h' => ['required', 'numeric', 'min:1'],
            'elements.frames.*.fit' => ['required', 'in:cover,contain'],
            'elements.frames.*.name' => ['nullable', 'string', 'max:100'],
        ];
    }
}
