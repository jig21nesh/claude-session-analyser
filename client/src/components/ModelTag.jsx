import { modelColour, shortModelName } from '../constants.js';

export default function ModelTag({ model }) {
  return (
    <span className="model-tag">
      <span className="model-dot" style={{ background: modelColour(model) }} aria-hidden="true" />
      {shortModelName(model)}
    </span>
  );
}
