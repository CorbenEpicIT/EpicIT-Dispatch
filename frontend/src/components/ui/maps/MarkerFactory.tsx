import { renderToStaticMarkup } from "react-dom/server";
import type { StaticMarker } from "../../../types/location";
import { Users, Wrench } from "lucide-react";

const iconStyles = "m-auto h-full text-white";

const CreateMarker = (m: StaticMarker) => {
	let bgColor = "";
	let icon = null;

	switch (m.type) {
		case "CLIENT": {
			bgColor = " bg-blue-500 ";
			icon = <Users className={iconStyles} size={20} />;
			break;
		}

		case "TECHNICIAN": {
			bgColor = " bg-orange-500 ";
			icon = <Wrench className={iconStyles} size={20} />;
			break;
		}
	}

	const reactElement = (
		<div className="flex flex-col">
			<div className="relative mx-auto">
				<div
					className={`w-8 h-8 rounded-full shadow-md border-3 border-white ${bgColor}`}
				></div>
				<div className="absolute top-0 left-0 w-8 h-8">{icon}</div>
			</div>

			<h1 className="font-bold text-shadow-lg">{m.label}</h1>
		</div>
	);

	const output = document.createElement("div");
	const staticElement = renderToStaticMarkup(reactElement);
	output.innerHTML = staticElement;
	output.classList.add("mapboxgl-marker");

	if (m.onClick) {
		output.style.cursor = "pointer";
		output.addEventListener("click", m.onClick);
	}

	return output;
};

export default CreateMarker;
